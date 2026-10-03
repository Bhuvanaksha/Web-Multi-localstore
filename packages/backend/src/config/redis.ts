import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { config } from './env.js';

/**
 * Creates a Redis client with exponential backoff. `lazyConnect` keeps the
 * client from touching the network until the first command, which lets the
 * app boot and tests run even when Redis is unavailable.
 */
export function createRedisClient(url = config.REDIS_URL): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error('Redis retry limit reached — giving up on Redis');
        return null;
      }
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err: Error) => {
    if (!err.message.includes('ECONNREFUSED') || process.env.NODE_ENV !== 'test') {
      logger.warn('Redis error', { error: err.message });
    }
  });
  client.on('ready', () => logger.info('Redis ready'));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
}

export const redisClient = createRedisClient();

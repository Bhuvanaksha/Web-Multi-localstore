import type { RequestHandler } from 'express';
import { type RateLimitRequestHandler, rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

function buildLimiter(
  windowMs: number,
  limit: number,
  store?: InstanceType<typeof RedisStore>,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store,
    // Tests exercise auth heavily and run without Redis.
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: 'Too many requests, please try again later.' },
  });
}

/**
 * Creates a rate limiter that starts with an in-memory store and upgrades
 * to a Redis-backed store once Redis connects. Redis is never touched
 * otherwise, so the API keeps serving (and tests stay green) without it.
 */
function createSwappableLimiter(windowMs: number, limit: number): RequestHandler {
  let current: RateLimitRequestHandler = buildLimiter(windowMs, limit);

  redisClient.on('ready', () => {
    try {
      current = buildLimiter(
        windowMs,
        limit,
        new RedisStore({
          // rate-limit-redis passes the command name as the first argument
          sendCommand: (...args: string[]) => {
            const [command, ...rest] = args;
            return redisClient.call(command, rest) as unknown as ReturnType<
              RedisStore['sendCommand']
            >;
          },
        }),
      );
      logger.info('Rate limiting switched to Redis store');
    } catch (err) {
      logger.warn('Failed to create Redis rate-limit store — keeping in-memory', {
        error: (err as Error).message,
      });
    }
  });

  return (req, res, next) => current(req, res, next);
}

/** 100 requests / minute per IP across the whole API. */
export const globalLimiter = createSwappableLimiter(60_000, 100);

/** 5 requests / minute per IP on authentication endpoints. */
export const authLimiter = createSwappableLimiter(60_000, 5);

/** 20 requests / minute per IP on search. */
export const searchLimiter = createSwappableLimiter(60_000, 20);

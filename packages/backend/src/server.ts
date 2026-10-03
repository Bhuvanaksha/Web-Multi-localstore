import { createServer } from 'node:http';
import { createApp } from './app.js';
import { closeMongo, connectMongo } from './config/db.js';
import { config } from './config/env.js';
import { redisClient } from './config/redis.js';
import { startReportScheduler } from './jobs/reportScheduler.js';
import { initSocket } from './socket/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  await connectMongo();

  // Redis is optional at boot (rate limiting/presence degrade gracefully).
  await redisClient.connect().catch((err: Error) => {
    logger.warn('Redis unavailable at startup — rate limiting falls back to in-memory', {
      error: (err as Error).message,
    });
  });

  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  server.listen(config.PORT, () => {
    logger.info(`API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
    logger.info(`Health check: http://localhost:${config.PORT}/healthz`);
    // Automated hourly Excel reports for admins.
    startReportScheduler();
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await closeMongo().catch(() => undefined);
      redisClient.disconnect();
      process.exit(0);
    });
    // Force exit after 10s if connections won't drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', {
    error: (err as Error).message,
    stack: (err as Error).stack,
  });
  process.exit(1);
});

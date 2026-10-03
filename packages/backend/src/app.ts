import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config/env.js';
import { WebhookController } from './controllers/WebhookController.js';
import { corsMiddleware } from './middleware/cors.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { requestId } from './middleware/requestId.js';
import { securityMiddleware } from './middleware/security.js';
import apiRouter from './routes/index.js';
import { createRequestLogger } from './utils/logger.js';

export function createApp(): express.Express {
  const app = express();

  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

  // ── Middleware order (spec §7) ─────────────────────────────────────────
  app.use(requestId);
  app.use(securityMiddleware);
  app.use(corsMiddleware);
  app.use(globalLimiter);

  // Request logging with requestId context
  app.use((req: Request, res: Response, next: NextFunction) => {
    const log = createRequestLogger({ requestId: req.id });
    const started = Date.now();
    res.on('finish', () => {
      log.info('request', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - started,
      });
    });
    next();
  });

  // JSON body parsing (10mb) — skipped for the Stripe webhook, which needs
  // the raw body for signature verification.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith(`${config.API_PREFIX}/webhooks`)) return next();
    express.json({ limit: '10mb' })(req, res, next);
  });

  app.use(cookieParser());
  app.use(csrfProtection);

  // ── Routes ─────────────────────────────────────────────────────────────
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(config.API_PREFIX, apiRouter);

  app.post(
    `${config.API_PREFIX}/webhooks/stripe`,
    express.raw({ type: 'application/json' }),
    WebhookController.stripe,
  );

  // ── Error handling ─────────────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

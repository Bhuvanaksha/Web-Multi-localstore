import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { AppError, AuthenticationError, ValidationError } from '../utils/errors.js';
import { createRequestLogger, logger } from '../utils/logger.js';

interface MongoDuplicateKeyError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

function isMongoDuplicate(err: unknown): err is MongoDuplicateKeyError {
  return typeof err === 'object' && err !== null && (err as MongoDuplicateKeyError).code === 11000;
}

/**
 * Final middleware. Every error funnels through here and is mapped to a
 * safe, consistent JSON shape: { error: { message, details? } }.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const log = createRequestLogger({ requestId: req.id, userId: req.user?.id });

  let error: AppError;

  if (err instanceof ZodError) {
    error = new ValidationError('Validation failed', err.issues);
  } else if (err instanceof jwt.TokenExpiredError || err instanceof jwt.JsonWebTokenError) {
    error = new AuthenticationError('Invalid or expired token');
  } else if (isMongoDuplicate(err)) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'field';
    const value = err.keyValue?.[field];
    error = new AppError(`Duplicate value for ${field}${value ? `: ${value}` : ''}`, 409);
  } else if (err instanceof AppError) {
    error = err;
  } else {
    // Unknown error: log the full stack, send a generic 500.
    const message = err instanceof Error ? err.message : 'Unknown error';
    error = new AppError('Internal server error', 500);
    log.error('Unhandled error', { message, stack: err instanceof Error ? err.stack : undefined });
  }

  if (error.statusCode >= 500) {
    log.error('Request failed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: error.statusCode,
      message: error.message,
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    log.warn('Request error', {
      method: req.method,
      url: req.originalUrl,
      statusCode: error.statusCode,
      message: error.message,
    });
  }

  const body: { error: { message: string; details?: unknown } } = {
    error: { message: error.message },
  };
  if (error.details !== undefined && !error.isOperational) {
    // Never leak internal details for non-operational errors.
  } else if (error.details !== undefined) {
    body.error.details = error.details;
  }

  res.status(error.statusCode).json(body);
}

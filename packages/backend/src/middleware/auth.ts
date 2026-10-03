import type { Role } from '@alpha/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface AccessTokenPayload {
  userId: string;
  role: Role;
  username?: string;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

/** Requires a valid access token; attaches `req.user`. */
export function protect(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    return next(new AuthenticationError('Missing Bearer token'));
  }
  try {
    const payload = jwt.verify(token, config.accessTokenPublicKey, {
      algorithms: ['RS256'],
    }) as unknown as AccessTokenPayload;
    if (!payload.userId || !payload.role) {
      throw new AuthenticationError('Malformed token payload');
    }
    req.user = { id: payload.userId, role: payload.role, username: payload.username };
    next();
  } catch (err) {
    if (err instanceof AuthenticationError) return next(err);
    logger.debug('JWT verification failed', { error: (err as Error).message });
    next(new AuthenticationError('Invalid or expired token'));
  }
}

/** Restricts a route to one or more roles (checked against `req.user.role`). */
export function restrictTo(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AuthenticationError());
    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

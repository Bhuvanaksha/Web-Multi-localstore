import type { NextFunction, Request, Response } from 'express';
import { AuthenticationError } from '../utils/errors.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Double-submit cookie CSRF protection for state-changing methods.
 * The SPA reads the non-httpOnly `XSRF-TOKEN` cookie and echoes it in the
 * `X-XSRF-TOKEN` header (axios does this automatically). Requests without
 * a CSRF cookie (curl, tests, non-browser clients) are allowed through.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.['XSRF-TOKEN'];
  if (!cookieToken) return next(); // no cookie => not a browser session

  const headerToken = req.headers['x-xsrf-token'];
  if (typeof headerToken !== 'string' || headerToken !== cookieToken) {
    return next(new AuthenticationError('CSRF token mismatch'));
  }
  next();
}

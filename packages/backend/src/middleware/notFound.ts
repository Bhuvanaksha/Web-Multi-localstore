import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../utils/errors.js';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError('Route not found'));
}

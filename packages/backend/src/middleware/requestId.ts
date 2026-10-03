import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers['x-request-id'];
  const id = Array.isArray(existing) ? existing[0] : (existing ?? uuidv4());
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}

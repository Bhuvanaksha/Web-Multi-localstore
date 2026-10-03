import type { NextFunction, Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService.js';
import { AuthenticationError } from '../utils/errors.js';

export const NotificationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const result = await NotificationService.listForUser(
        req.user.id,
        Number(req.query.limit) || 20,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const result = await NotificationService.markRead(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const result = await NotificationService.markAllRead(req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

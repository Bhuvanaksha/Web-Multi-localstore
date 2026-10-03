import type { NextFunction, Request, Response } from 'express';
import { VoteService } from '../services/VoteService.js';
import { AuthenticationError } from '../utils/errors.js';

export const VoteController = {
  async toggle(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const { targetId, targetType, value } = req.body;
      const result = await VoteService.toggle(req.user.id, targetId, targetType, value);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

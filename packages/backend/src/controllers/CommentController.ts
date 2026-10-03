import type { NextFunction, Request, Response } from 'express';
import { CommentService } from '../services/CommentService.js';
import { AuthenticationError } from '../utils/errors.js';

export const CommentController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const comment = await CommentService.create(req.body, req.user.id);
      res.status(201).json({ comment });
    } catch (err) {
      next(err);
    }
  },

  async listTree(req: Request, res: Response, next: NextFunction) {
    try {
      const { resourceId } = req.params;
      const tree = await CommentService.getTree(resourceId);
      res.status(200).json({ comments: tree });
    } catch (err) {
      next(err);
    }
  },
};

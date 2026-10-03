import type { NextFunction, Request, Response } from 'express';
import { SearchService } from '../services/SearchService.js';

export const SearchController = {
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const tags =
        typeof req.query.tags === 'string'
          ? req.query.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;

      const result = await SearchService.search(query, { category, tags }, page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

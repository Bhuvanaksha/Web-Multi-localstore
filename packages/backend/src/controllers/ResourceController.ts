import type { NextFunction, Request, Response } from 'express';
import { ResourceService } from '../services/ResourceService.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

function parsePagination(query: Record<string, unknown>) {
  return {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10,
  };
}

export const ResourceController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = parsePagination(req.query);
      const result = await ResourceService.getFeed({
        page,
        limit,
        category: req.query.category as string | undefined,
        tag: req.query.tag as string | undefined,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const resource = await ResourceService.create(req.body, req.user.id);
      res.status(201).json({ resource });
    } catch (err) {
      next(err);
    }
  },

  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      // Lookup by slug or by ObjectId
      const resource = /^[0-9a-fA-F]{24}$/.test(id)
        ? await ResourceService.getById(id, { incrementView: true })
        : await ResourceService.getBySlug(id);
      res.status(200).json({ resource });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const resource = await ResourceService.update(req.params.id, req.user, req.body);
      res.status(200).json({ resource });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const result = await ResourceService.softDelete(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async mine(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new NotFoundError('Not authenticated');
      const { page, limit } = parsePagination(req.query);
      const result = await ResourceService.getMine(req.user.id, page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async adminList(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = parsePagination(req.query);
      const result = await ResourceService.getAllForAdmin(
        req.query.status as string as never,
        page,
        limit,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new NotFoundError('Not authenticated');
      const resource = await ResourceService.submitForReview(req.params.id, req.user.id);
      res.status(200).json({ resource });
    } catch (err) {
      next(err);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new NotFoundError('Not authenticated');
      const resource = await ResourceService.approve(req.params.id, req.user.id);
      res.status(200).json({ resource });
    } catch (err) {
      next(err);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new NotFoundError('Not authenticated');
      const resource = await ResourceService.reject(req.params.id, req.user.id, req.body?.reason);
      res.status(200).json({ resource });
    } catch (err) {
      next(err);
    }
  },

  async requestChanges(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new NotFoundError('Not authenticated');
      const resource = await ResourceService.requestChanges(
        req.params.id,
        req.user.id,
        req.body?.notes,
      );
      res.status(200).json({ resource });
    } catch (err) {
      next(err);
    }
  },
};

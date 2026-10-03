import type { NextFunction, Request, Response } from 'express';
import { OrderService } from '../services/OrderService.js';
import { ConflictError } from '../utils/errors.js';

function parsePagination(query: Record<string, unknown>) {
  return {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
  };
}

export const OrderController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const order = await OrderService.create(req.user.id, req.body, req.user.username);
      res.status(201).json({ order });
    } catch (err) {
      next(err);
    }
  },

  async pay(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const order = await OrderService.markPaid(req.params.id, req.user);
      res.status(200).json({ order });
    } catch (err) {
      next(err);
    }
  },

  async paymentIntent(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const intent = await OrderService.createPaymentIntent(req.params.id, req.user.id);
      res.status(200).json(intent);
    } catch (err) {
      next(err);
    }
  },

  async paymentVerify(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const order = await OrderService.verifyPayment(req.params.id, req.user.id, req.body);
      res.status(200).json({ order });
    } catch (err) {
      next(err);
    }
  },

  async mine(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const { page, limit } = parsePagination(req.query);
      const result = await OrderService.getMine(req.user.id, page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async providerInbox(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const { page, limit } = parsePagination(req.query);
      const result = await OrderService.getProviderInbox(req.user.id, page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async setStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const order = await OrderService.setStatus(req.params.id, req.user, req.body.status);
      res.status(200).json({ order });
    } catch (err) {
      next(err);
    }
  },
};

import type { NextFunction, Request, Response } from 'express';
import { TransactionService } from '../services/TransactionService.js';

export const WebhookController = {
  async stripe(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        res.status(400).json({ error: { message: 'Missing stripe-signature header' } });
        return;
      }
      const result = await TransactionService.handleWebhook(req.body, signature);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

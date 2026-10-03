import { BUYER_ROLES, CreateOrderSchema } from '@alpha/shared';
import { Router } from 'express';
import { z } from 'zod';
import { OrderController } from '../controllers/OrderController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

// Only buyers can place orders — providers sell, they don't shop.
router.post(
  '/',
  protect,
  restrictTo(...BUYER_ROLES),
  validate(CreateOrderSchema),
  OrderController.create,
);
router.get('/mine', protect, OrderController.mine);
router.get('/provider/inbox', protect, OrderController.providerInbox);
router.patch(
  '/:id/status',
  protect,
  validate({
    body: z
      .object({ status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']) })
      .strict(),
  }),
  OrderController.setStatus,
);
router.post('/:id/pay', protect, OrderController.pay);
router.post('/:id/payment-intent', protect, OrderController.paymentIntent);
router.post(
  '/:id/payment-verify',
  protect,
  validate({
    body: z
      .object({
        razorpayOrderId: z.string().optional(),
        razorpayPaymentId: z.string().optional(),
        razorpaySignature: z.string().optional(),
      })
      .strict(),
  }),
  OrderController.paymentVerify,
);

export default router;

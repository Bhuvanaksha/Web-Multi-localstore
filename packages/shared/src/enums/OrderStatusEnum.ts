import { z } from 'zod';

/**
 * Lifecycle of a marketplace order:
 *   pending → confirmed → shipped → delivered
 *   pending → cancelled (by customer or provider)
 */
export const OrderStatusEnum = z.enum([
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);

export type OrderStatus = z.infer<typeof OrderStatusEnum>;

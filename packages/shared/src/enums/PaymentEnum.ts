import { z } from 'zod';

/** How the customer paid: UPI, cash on delivery, or card. */
export const PaymentMethodEnum = z.enum(['upi', 'cod', 'card']);

export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

/** Payment lifecycle for an order. */
export const PaymentStatusEnum = z.enum(['unpaid', 'paid', 'refunded']);

export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

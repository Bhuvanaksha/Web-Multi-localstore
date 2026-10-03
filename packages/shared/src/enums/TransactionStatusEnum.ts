import { z } from 'zod';

export const TransactionStatusEnum = z.enum([
  'pending',
  'paid',
  'processing',
  'fulfilled',
  'failed',
  'refunded',
  'disputed',
]);

export type TransactionStatus = z.infer<typeof TransactionStatusEnum>;

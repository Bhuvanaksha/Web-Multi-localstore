import { z } from 'zod';
import { TransactionStatusEnum } from '../enums/TransactionStatusEnum.js';

export const TransactionSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  resourceId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().default('usd'),
  status: TransactionStatusEnum,
  paymentProvider: z.enum(['stripe', 'paypal']),
  providerTxId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateTransactionSchema = TransactionSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

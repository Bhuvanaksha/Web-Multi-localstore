import { type TransactionStatus, TransactionStatusEnum } from '@alpha/shared';
import mongoose, { type Document, Schema } from 'mongoose';

export interface TransactionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  resourceId?: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: TransactionStatus;
  paymentProvider: 'stripe' | 'paypal';
  providerTxId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<TransactionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resourceId: { type: Schema.Types.ObjectId, ref: 'Resource' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'usd', uppercase: true },
    status: {
      type: String,
      enum: TransactionStatusEnum.options,
      default: 'pending',
      required: true,
    },
    paymentProvider: { type: String, enum: ['stripe', 'paypal'], required: true },
    providerTxId: { type: String, unique: true, sparse: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// User history + provider idempotency (webhooks may arrive more than once).
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ providerTxId: 1 }, { unique: true, sparse: true });

export const TransactionModel = mongoose.model<TransactionDocument>(
  'Transaction',
  transactionSchema,
);

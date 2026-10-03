import Stripe from 'stripe';
import { config } from '../config/env.js';
import { TransactionModel } from '../models/TransactionModel.js';
import { emitToUser } from '../socket/index.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!config.STRIPE_SECRET_KEY) {
      throw new AppError('Stripe is not configured (STRIPE_SECRET_KEY missing)', 503);
    }
    stripe = new Stripe(config.STRIPE_SECRET_KEY);
  }
  return stripe;
}

export const TransactionService = {
  /** Creates a Stripe PaymentIntent and records a `pending` transaction. */
  async createPaymentIntent(
    userId: string,
    amount: number,
    metadata: Record<string, unknown> = {},
  ): Promise<{ clientSecret: string; transactionId: string }> {
    const s = getStripe();

    const paymentIntent = await s.paymentIntents.create({
      amount: Math.round(amount * 100), // stripe works in cents
      currency: 'usd',
      metadata: { userId, ...metadata },
      automatic_payment_methods: { enabled: true },
    });

    const txn = await TransactionModel.create({
      userId,
      resourceId: (metadata.resourceId as string) || undefined,
      amount,
      currency: 'usd',
      status: 'pending',
      paymentProvider: 'stripe',
      providerTxId: paymentIntent.id,
      metadata,
    });

    return { clientSecret: paymentIntent.client_secret ?? '', transactionId: txn._id.toString() };
  },

  /** Verifies the webhook signature and processes the event idempotently. */
  async handleWebhook(rawBody: string | Buffer, signature: string): Promise<{ received: boolean }> {
    if (!config.STRIPE_WEBHOOK_SECRET) {
      throw new AppError('Stripe webhook secret is not configured', 503);
    }
    const s = getStripe();

    let event: Stripe.Event;
    try {
      event = s.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', {
        error: (err as Error).message,
      });
      throw new AppError('Invalid webhook signature', 400);
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.onPaymentSucceeded(pi.id, pi.metadata?.userId);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await TransactionModel.updateOne({ providerTxId: pi.id }, { $set: { status: 'failed' } });
        break;
      }
      default:
        break;
    }
    return { received: true };
  },

  async onPaymentSucceeded(providerTxId: string, userId?: string): Promise<void> {
    const txn = await TransactionModel.findOne({ providerTxId });
    if (!txn) throw new NotFoundError('Transaction not found for provider id');
    if (txn.status !== 'pending') return; // idempotent — already processed

    txn.status = 'paid';
    await txn.save();

    if (userId) {
      emitToUser(userId, 'transaction:update', {
        transactionId: txn._id.toString(),
        status: txn.status,
      });
    }
    logger.info('transaction paid', { providerTxId, transactionId: txn._id.toString() });
  },
};

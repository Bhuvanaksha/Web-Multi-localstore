import { createHmac } from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let instance: Razorpay | null = null;

export function razorpayConfigured(): boolean {
  return Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);
}

function getInstance(): Razorpay | null {
  if (!razorpayConfigured()) return null;
  if (!instance) {
    instance = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID as string,
      key_secret: config.RAZORPAY_KEY_SECRET as string,
    });
  }
  return instance;
}

export interface RazorpayOrderInput {
  /** Amount in the smallest currency unit (paise for INR). */
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}

/**
 * Creates a Razorpay order server-side. Returns null when the gateway is not
 * configured (the app then falls back to the demo flow).
 */
export async function createRazorpayOrder(
  input: RazorpayOrderInput,
): Promise<{ id: string; amount: number; currency: string } | null> {
  const rp = getInstance();
  if (!rp) return null;
  try {
    const created = (await rp.orders.create({
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
      payment_capture: true,
    })) as unknown as { id: string; amount: number; currency: string };
    logger.info('razorpay order created', { orderId: created.id, amount: created.amount });
    return { id: created.id, amount: created.amount, currency: created.currency };
  } catch (err) {
    logger.error('razorpay order creation failed', { error: (err as Error).message });
    throw new Error('Payment gateway error — please try again');
  }
}

/**
 * Verifies the Razorpay payment signature (HMAC-SHA256 of
 * `order_id|payment_id` with the key secret).
 */
export function verifyRazorpaySignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!config.RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex');
  return expected === input.signature;
}

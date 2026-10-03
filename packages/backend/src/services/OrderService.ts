import type { CreateOrderInput, OrderStatus, PaymentMethod } from '@alpha/shared';
import { config } from '../config/env.js';
import { type OrderDocument, OrderModel } from '../models/OrderModel.js';
import { ProviderListingModel } from '../models/ProviderListingModel.js';
import { UserModel } from '../models/UserModel.js';
import { sendMail } from '../utils/email.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ActivityService } from './ActivityService.js';
import { NotificationService } from './NotificationService.js';
import {
  createRazorpayOrder,
  razorpayConfigured,
  verifyRazorpaySignature,
} from './PaymentService.js';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Allowed forward transitions for delivery tracking. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function serializeOrder(doc: OrderDocument | Record<string, unknown>) {
  const obj =
    typeof (doc as OrderDocument).toObject === 'function'
      ? (doc as OrderDocument).toObject()
      : (doc as Record<string, unknown>);
  return {
    id: obj._id.toString(),
    customerId: obj.customerId?.toString(),
    items: (obj.items as unknown[]).map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        listingId: item.listingId?.toString(),
        providerId: item.providerId?.toString(),
        title: item.title,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        unit: item.unit,
      };
    }),
    totalPrice: obj.totalPrice,
    currency: obj.currency,
    status: obj.status,
    paymentMethod: obj.paymentMethod,
    paymentStatus: obj.paymentStatus,
    razorpayOrderId: obj.razorpayOrderId,
    providerTxId: obj.providerTxId,
    statusHistory: obj.statusHistory,
    note: obj.note,
    delivery: obj.delivery,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

export const OrderService = {
  /**
   * Places an order: snapshots prices/titles, decrements stock atomically
   * (no double-selling when two customers order at once), and computes the
   * total in ₹. UPI/card are treated as paid (simulated gateway); cash on
   * delivery stays unpaid until the provider completes it. Every provider
   * on the order is notified in realtime.
   */
  async create(customerId: string, input: CreateOrderInput, actorUsername?: string) {
    const items = [];
    let totalPrice = 0;

    for (const line of input.items) {
      const listing = await ProviderListingModel.findById(line.listingId);
      if (!listing) throw new NotFoundError(`Listing not found: ${line.listingId}`);
      if (listing.availability !== 'available') {
        throw new ConflictError(`"${listing.title}" is not available right now`);
      }

      if (listing.quantity !== undefined) {
        // Atomic decrement guarded by availability + sufficient stock.
        const updated = await ProviderListingModel.findOneAndUpdate(
          {
            _id: listing._id,
            availability: 'available',
            quantity: { $gte: line.quantity },
          },
          { $inc: { quantity: -line.quantity } },
          { new: true },
        );
        if (!updated) {
          const fresh = await ProviderListingModel.findById(listing._id);
          const remaining = fresh?.quantity ?? 0;
          throw new ConflictError(
            fresh && remaining < line.quantity
              ? `Only ${remaining} of "${fresh.title}" in stock`
              : `"${listing.title}" just sold out — please refresh`,
          );
        }
        // Flip to sold out the moment stock hits zero (auto-refreshes buyers).
        if (updated.quantity === 0) {
          await ProviderListingModel.updateOne(
            { _id: updated._id },
            { $set: { availability: 'sold_out' } },
          );
        }
      }

      const lineTotal = listing.price * line.quantity;
      totalPrice += lineTotal;
      items.push({
        listingId: listing._id,
        providerId: listing.providerId,
        title: listing.title,
        unitPrice: listing.price,
        quantity: line.quantity,
        unit: listing.unit,
      });
    }

    const paymentMethod: PaymentMethod = input.paymentMethod ?? 'upi';
    // With a real gateway configured, UPI/card orders start unpaid until the
    // customer completes Razorpay checkout. In demo mode they clear instantly.
    const needsRealPayment = paymentMethod !== 'cod' && razorpayConfigured();
    const order = await OrderModel.create({
      customerId,
      items,
      totalPrice,
      currency: 'INR',
      status: 'pending',
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' || needsRealPayment ? 'unpaid' : 'paid',
      statusHistory: [{ status: 'pending', at: new Date() }],
      note: input.note,
      delivery: input.delivery,
    });
    logger.info('order placed', {
      orderId: order._id.toString(),
      customerId,
      totalPrice,
      paymentMethod,
      itemCount: items.length,
    });
    await ActivityService.log({
      actorId: customerId,
      action: 'order.placed',
      entityType: 'Order',
      entityId: order._id.toString(),
      metadata: { totalPrice, itemCount: items.length, paymentMethod, username: actorUsername },
    });

    // Notify every provider on the order (deduplicated): in-app bell + email.
    const shortId = order._id.toString().slice(-6).toUpperCase();
    const uniqueProviders = [...new Set(items.map((i) => i.providerId.toString()))];
    for (const providerId of uniqueProviders) {
      const myItems = items
        .filter((i) => i.providerId.toString() === providerId)
        .map((i) => `${i.title} ×${i.quantity}`)
        .join(', ');
      await NotificationService.push(providerId, 'order', {
        message: `📦 New order #${shortId}: ${myItems} — ₹${totalPrice}`,
      });
    }
    // Email the providers (SMTP optional — messages are logged when unset).
    const providers = await UserModel.find({ _id: { $in: uniqueProviders } }).select('email');
    for (const p of providers) {
      await sendMail({
        to: p.email,
        subject: `New order #${shortId} — ₹${totalPrice}`,
        text: `You have a new order (₹${totalPrice}). Log in to confirm it and start fulfilment.`,
      });
    }

    return serializeOrder(order);
  },

  async getMine(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<Paginated<ReturnType<typeof serializeOrder>>> {
    const [items, total] = await Promise.all([
      OrderModel.find({ customerId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrderModel.countDocuments({ customerId }),
    ]);
    return {
      items: items.map(serializeOrder),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /** Orders containing at least one item sold by the given provider. */
  async getProviderInbox(
    providerId: string,
    page = 1,
    limit = 20,
  ): Promise<Paginated<ReturnType<typeof serializeOrder>>> {
    const [items, total] = await Promise.all([
      OrderModel.find({ 'items.providerId': providerId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrderModel.countDocuments({ 'items.providerId': providerId }),
    ]);
    return {
      items: items.map(serializeOrder),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Delivery-tracking transitions, forward-only:
   *   pending → confirmed → shipped → delivered
   *   pending → cancelled
   * The customer may cancel a pending order; providers may advance their own
   * orders and cancel while pending. Each step is recorded in statusHistory
   * and the customer is notified.
   */
  async setStatus(id: string, actor: { id: string; role: string }, status: OrderStatus) {
    const order = await OrderModel.findById(id);
    if (!order) throw new NotFoundError('Order not found');

    const isCustomer = order.customerId.toString() === actor.id;
    const isProvider = order.items.some((i) => i.providerId.toString() === actor.id);

    if (status === 'cancelled') {
      if (!isCustomer && !isProvider) {
        throw new ConflictError('Only the customer or a provider on this order can cancel it');
      }
      if (order.status !== 'pending') {
        throw new ConflictError(`Cannot cancel an order in status "${order.status}"`);
      }
      await this.restoreStock(order);
    } else {
      if (!isProvider) {
        throw new ConflictError(`Only a provider on this order can mark it ${status}`);
      }
      if (!TRANSITIONS[order.status as OrderStatus].includes(status)) {
        throw new ConflictError(`Cannot move an order from "${order.status}" to "${status}"`);
      }
    }

    order.status = status;
    order.statusHistory.push({ status, at: new Date(), by: actor.id });
    await order.save();
    await ActivityService.log({
      actorId: actor.id,
      action: `order.${status}`,
      entityType: 'Order',
      entityId: order._id.toString(),
      metadata: { totalPrice: order.totalPrice, fromStatus: order.status },
    });

    const shortId = order._id.toString().slice(-6).toUpperCase();
    const customer = await UserModel.findById(order.customerId).select('email');
    const customerLabel: Record<string, string> = {
      confirmed: `✅ Order #${shortId} confirmed — ₹${order.totalPrice}`,
      shipped: `🚚 Order #${shortId} shipped — on its way!`,
      delivered: `🎉 Order #${shortId} delivered. Enjoy!`,
    };
    if (status === 'confirmed' || status === 'shipped' || status === 'delivered') {
      await NotificationService.push(order.customerId.toString(), 'order', {
        message: customerLabel[status],
      });
      if (customer) {
        await sendMail({
          to: customer.email,
          subject: `Order #${shortId} ${status}`,
          text: customerLabel[status],
        });
      }
    } else if (status === 'cancelled') {
      const byProvider = isProvider && !isCustomer;
      const message = `❌ Order #${shortId} was cancelled${byProvider ? ' by the provider' : ''}`;
      await NotificationService.push(order.customerId.toString(), 'order', { message });
      if (customer) {
        await sendMail({
          to: customer.email,
          subject: `Order #${shortId} cancelled`,
          text: message,
        });
      }
      if (isCustomer) {
        for (const providerId of new Set(order.items.map((i) => i.providerId.toString()))) {
          await NotificationService.push(providerId, 'order', {
            message: `❌ Order #${shortId} was cancelled by the customer`,
          });
        }
      }
    }
    return serializeOrder(order);
  },

  /**
   * Starts payment for an unpaid order. With Razorpay configured this creates
   * a gateway order (frontend then runs Razorpay checkout and verifies);
   * otherwise the frontend falls back to the demo mark-paid flow.
   */
  async createPaymentIntent(id: string, customerId: string) {
    const order = await OrderModel.findById(id);
    if (!order) throw new NotFoundError('Order not found');
    if (order.customerId.toString() !== customerId) {
      throw new ConflictError('Only the customer can pay for this order');
    }
    if (order.paymentStatus === 'paid') {
      throw new ConflictError('Order is already paid');
    }
    if (!razorpayConfigured()) {
      return { gateway: 'demo' as const, orderId: order._id.toString() };
    }

    const rpOrder = await createRazorpayOrder({
      amountPaise: Math.round(order.totalPrice * 100),
      receipt: `order_${order._id.toString().slice(-10)}`,
      notes: { orderId: order._id.toString() },
    });
    if (!rpOrder) return { gateway: 'demo' as const, orderId: order._id.toString() };

    order.razorpayOrderId = rpOrder.id;
    await order.save();
    return {
      gateway: 'razorpay' as const,
      keyId: config.RAZORPAY_KEY_ID,
      orderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
    };
  },

  /**
   * Verifies a Razorpay payment signature and marks the order paid. Returns
   * a demo shortcut (no-op paid) when the gateway is not configured.
   */
  async verifyPayment(
    id: string,
    customerId: string,
    payload: { razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string },
  ) {
    const order = await OrderModel.findById(id);
    if (!order) throw new NotFoundError('Order not found');
    if (order.customerId.toString() !== customerId) {
      throw new ConflictError('Only the customer can complete payment for this order');
    }
    if (order.paymentStatus === 'paid') return serializeOrder(order);

    if (payload.razorpayOrderId && payload.razorpayPaymentId && payload.razorpaySignature) {
      if (order.razorpayOrderId !== payload.razorpayOrderId) {
        throw new ConflictError('Razorpay order does not match this order');
      }
      const valid = verifyRazorpaySignature({
        orderId: payload.razorpayOrderId,
        paymentId: payload.razorpayPaymentId,
        signature: payload.razorpaySignature,
      });
      if (!valid) throw new ConflictError('Payment signature verification failed');
      order.providerTxId = payload.razorpayPaymentId;
    }

    order.paymentStatus = 'paid';
    await order.save();
    await ActivityService.log({
      actorId: customerId,
      action: 'order.paid',
      entityType: 'Order',
      entityId: order._id.toString(),
      metadata: { totalPrice: order.totalPrice, by: 'customer', providerTxId: order.providerTxId },
    });
    return serializeOrder(order);
  },

  /** Customer (or provider on delivery) marks the order paid (demo flow). */
  async markPaid(id: string, actor: { id: string; role: string }) {
    const order = await OrderModel.findById(id);
    if (!order) throw new NotFoundError('Order not found');
    const isCustomer = order.customerId.toString() === actor.id;
    const isProvider = order.items.some((i) => i.providerId.toString() === actor.id);
    if (!isCustomer && !isProvider) {
      throw new ConflictError('Only the customer or a provider on this order can mark it paid');
    }
    order.paymentStatus = 'paid';
    await order.save();
    await ActivityService.log({
      actorId: actor.id,
      action: 'order.paid',
      entityType: 'Order',
      entityId: order._id.toString(),
      metadata: { totalPrice: order.totalPrice, by: isCustomer ? 'customer' : 'provider' },
    });
    return serializeOrder(order);
  },

  /** Returns reserved stock to the listings when an order is cancelled. */
  async restoreStock(order: OrderDocument): Promise<void> {
    for (const item of order.items) {
      const listing = await ProviderListingModel.findById(item.listingId);
      if (!listing) continue;
      if (listing.quantity !== undefined) {
        listing.quantity += item.quantity;
        if (listing.availability === 'sold_out') listing.availability = 'available';
        await listing.save();
      }
    }
  },
};

import { z } from 'zod';
import { OrderStatusEnum } from '../enums/OrderStatusEnum.js';
import { PaymentMethodEnum, PaymentStatusEnum } from '../enums/PaymentEnum.js';

/** Where the order should be delivered (collected at checkout). */
export const DeliveryAddressSchema = z.object({
  fullName: z.string().min(2, 'Recipient name is required').max(80),
  phone: z
    .string()
    .min(10, 'Phone number is required')
    .max(15)
    .regex(/^[+]?[0-9\s-]{10,15}$/, 'Enter a valid phone number'),
  addressLine1: z.string().min(5, 'Address is required').max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(2, 'City is required').max(80),
  state: z.string().min(2, 'State is required').max(80),
  pincode: z.string().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
  landmark: z.string().max(120).optional(),
});
export type DeliveryAddress = z.infer<typeof DeliveryAddressSchema>;

/** A single ordered line item — prices/titles are snapshotted at order time. */
export const OrderStatusHistoryEntrySchema = z.object({
  status: OrderStatusEnum,
  at: z.date(),
  by: z.string().optional(),
});
export const OrderItemSchema = z.object({
  listingId: z.string(),
  providerId: z.string(),
  title: z.string(),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().min(1),
  unit: z.string().optional(),
});

/** Full order document. */
export const OrderSchema = z.object({
  id: z.string().optional(),
  customerId: z.string(),
  items: z.array(OrderItemSchema).min(1).max(50),
  totalPrice: z.number().nonnegative(),
  currency: z.string().default('INR'),
  status: OrderStatusEnum,
  paymentMethod: PaymentMethodEnum.optional(),
  paymentStatus: PaymentStatusEnum.default('unpaid'),
  statusHistory: z.array(OrderStatusHistoryEntrySchema).optional(),
  note: z.string().max(500).optional(),
  delivery: DeliveryAddressSchema.optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

/** Client input: which listings and how many. Server prices them. */
export const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        listingId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(50),
  note: z.string().max(500).optional(),
  paymentMethod: PaymentMethodEnum.default('upi'),
  delivery: DeliveryAddressSchema,
});

export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

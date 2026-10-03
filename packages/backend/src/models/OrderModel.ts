import {
  type OrderStatus,
  OrderStatusEnum,
  type PaymentMethod,
  PaymentMethodEnum,
  type PaymentStatus,
  PaymentStatusEnum,
} from '@alpha/shared';
import mongoose, { type Document, Schema } from 'mongoose';

export interface OrderItemDocument {
  listingId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  title: string;
  unitPrice: number;
  quantity: number;
  unit?: string;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  at: Date;
  by?: string;
}

export interface DeliveryAddressDocument {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}

export interface OrderDocument extends Document {
  customerId: mongoose.Types.ObjectId;
  items: OrderItemDocument[];
  totalPrice: number;
  currency: string;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  razorpayOrderId?: string;
  providerTxId?: string;
  statusHistory: OrderStatusHistoryEntry[];
  note?: string;
  delivery?: DeliveryAddressDocument;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItemDocument>(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'ProviderListing', required: true },
    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String },
  },
  { _id: false },
);

const statusHistoryEntrySchema = new Schema<OrderStatusHistoryEntry>(
  {
    status: { type: String, enum: OrderStatusEnum.options, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String },
  },
  { _id: false },
);

const deliveryAddressSchema = new Schema<DeliveryAddressDocument>(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    landmark: { type: String },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDocument>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v: OrderItemDocument[]) => v.length >= 1, 'at least one item'],
    },
    totalPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: OrderStatusEnum.options, default: 'pending', required: true },
    paymentMethod: { type: String, enum: PaymentMethodEnum.options },
    paymentStatus: {
      type: String,
      enum: PaymentStatusEnum.options,
      default: 'unpaid',
      required: true,
    },
    razorpayOrderId: { type: String },
    providerTxId: { type: String },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
    note: { type: String, maxlength: 500 },
    delivery: { type: deliveryAddressSchema },
  },
  { timestamps: true },
);

// Query indexes
orderSchema.index({ customerId: 1, createdAt: -1 }); // "my orders"
orderSchema.index({ 'items.providerId': 1, createdAt: -1 }); // provider inbox
orderSchema.index({ status: 1 });

export const OrderModel = mongoose.model<OrderDocument>('Order', orderSchema);

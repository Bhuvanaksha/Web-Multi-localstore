import {
  type ProviderListingAvailability,
  ProviderListingAvailabilityEnum,
  type ProviderListingCategory,
  ProviderListingCategoryEnum,
} from '@alpha/shared';
import mongoose, { type Document, Schema } from 'mongoose';

export interface ProviderListingDocument extends Document {
  providerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  category: ProviderListingCategory;
  price: number;
  unit?: string;
  currency: string;
  quantity?: number;
  availability: ProviderListingAvailability;
  contactPhone?: string;
  contactEmail?: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const providerListingSchema = new Schema<ProviderListingDocument>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, minlength: 3, maxlength: 120, trim: true },
    description: { type: String, required: true, minlength: 10, maxlength: 2000 },
    category: {
      type: String,
      enum: ProviderListingCategoryEnum.options,
      required: true,
    },
    price: { type: Number, required: true, min: 0, max: 1_000_000 },
    unit: { type: String, maxlength: 30, trim: true },
    currency: { type: String, default: 'INR', maxlength: 8, trim: true },
    quantity: { type: Number, min: 0 },
    availability: {
      type: String,
      enum: ProviderListingAvailabilityEnum.options,
      default: 'available',
      required: true,
    },
    contactPhone: { type: String, maxlength: 40, trim: true },
    contactEmail: { type: String, maxlength: 120, trim: true },
    imageUrl: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

// Query indexes
providerListingSchema.index({ providerId: 1, createdAt: -1 }); // "my listings"
providerListingSchema.index({ category: 1, availability: 1 }); // marketplace browse
providerListingSchema.index({ availability: 1, createdAt: -1 }); // public feed

export const ProviderListingModel = mongoose.model<ProviderListingDocument>(
  'ProviderListing',
  providerListingSchema,
);

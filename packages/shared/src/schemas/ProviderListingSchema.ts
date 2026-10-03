import { z } from 'zod';
import {
  ProviderListingAvailabilityEnum,
  ProviderListingCategoryEnum,
  ProviderListingUnitEnum,
} from '../enums/ProviderListingCategoryEnum.js';

/**
 * A marketplace listing created by a provider — a service they offer
 * (e.g. plumbing, tutoring) or a product they sell (e.g. groceries, items).
 */
export const ProviderListingSchema = z.object({
  id: z.string().optional(),
  providerId: z.string(),
  /** Display name of the provider (populated server-side). */
  providerName: z.string().optional(),
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  category: ProviderListingCategoryEnum,
  price: z.number().nonnegative().max(1_000_000),
  unit: ProviderListingUnitEnum.optional(),
  currency: z.string().max(8).default('INR'),
  quantity: z.number().int().nonnegative().optional(),
  availability: ProviderListingAvailabilityEnum.default('available'),
  contactPhone: z.string().max(40).optional(),
  contactEmail: z.string().email().max(120).optional(),
  imageUrl: z.string().url().max(500).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateProviderListingSchema = ProviderListingSchema.omit({
  id: true,
  providerId: true, // assigned server-side from the JWT
  createdAt: true,
  updatedAt: true,
});

export const UpdateProviderListingSchema = z
  .object({
    title: z.string().min(3).max(120).optional(),
    description: z.string().min(10).max(2000).optional(),
    category: ProviderListingCategoryEnum.optional(),
    price: z.number().nonnegative().max(1_000_000).optional(),
    unit: ProviderListingUnitEnum.optional(),
    currency: z.string().max(8).optional(),
    quantity: z.number().int().nonnegative().optional(),
    availability: ProviderListingAvailabilityEnum.optional(),
    contactPhone: z.string().max(40).optional(),
    contactEmail: z.string().email().max(120).optional(),
    imageUrl: z.string().url().max(500).optional(),
  })
  .strict();

export type ProviderListing = z.infer<typeof ProviderListingSchema>;
export type CreateProviderListingInput = z.infer<typeof CreateProviderListingSchema>;
export type UpdateProviderListingInput = z.infer<typeof UpdateProviderListingSchema>;

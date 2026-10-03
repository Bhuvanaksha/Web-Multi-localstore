import { z } from 'zod';

/** What a provider is offering: a service, groceries, physical items, etc. */
export const ProviderListingCategoryEnum = z.enum(['service', 'grocery', 'item', 'other']);

export type ProviderListingCategory = z.infer<typeof ProviderListingCategoryEnum>;

/** Availability of a provider listing. */
export const ProviderListingAvailabilityEnum = z.enum(['available', 'sold_out', 'unavailable']);

export type ProviderListingAvailability = z.infer<typeof ProviderListingAvailabilityEnum>;

/** Sale units supported by the marketplace (kg, litres, units, pieces, other). */
export const ProviderListingUnitEnum = z.enum(['kg', 'l', 'units', 'pcs', 'other']);

export type ProviderListingUnit = z.infer<typeof ProviderListingUnitEnum>;

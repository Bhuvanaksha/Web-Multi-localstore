import type { CreateProviderListingInput, UpdateProviderListingInput } from '@alpha/shared';
import type { FilterQuery } from 'mongoose';
import {
  type ProviderListingDocument,
  ProviderListingModel,
} from '../models/ProviderListingModel.js';
import { AuthorizationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ActivityService } from './ActivityService.js';

export interface ListingQuery {
  page?: number;
  limit?: number;
  category?: string;
  availability?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PROVIDER_SELECT = 'username profile.firstName profile.lastName';

export function serializeListing(doc: ProviderListingDocument | Record<string, unknown>) {
  const obj =
    typeof (doc as ProviderListingDocument).toObject === 'function'
      ? (doc as ProviderListingDocument).toObject()
      : (doc as Record<string, unknown>);
  const provider =
    typeof obj.providerId === 'object' && obj.providerId !== null
      ? (obj.providerId as Record<string, unknown>)
      : undefined;
  const firstName = (provider?.profile as Record<string, unknown> | undefined)?.firstName;
  const lastName = (provider?.profile as Record<string, unknown> | undefined)?.lastName;
  return {
    id: obj._id.toString(),
    providerId: (provider?._id ?? obj.providerId)?.toString(),
    providerName:
      [firstName, lastName].filter(Boolean).join(' ') ||
      (provider?.username as string) ||
      undefined,
    title: obj.title,
    description: obj.description,
    category: obj.category,
    price: obj.price,
    unit: obj.unit,
    currency: obj.currency,
    quantity: obj.quantity,
    availability: obj.availability,
    contactPhone: obj.contactPhone,
    contactEmail: obj.contactEmail,
    imageUrl: obj.imageUrl,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

export const ProviderListingService = {
  async create(data: CreateProviderListingInput, providerId: string) {
    const doc = await ProviderListingModel.create({ ...data, providerId });
    logger.info('provider listing created', { listingId: doc._id.toString(), providerId });
    await ActivityService.log({
      actorId: providerId,
      action: 'listing.created',
      entityType: 'ProviderListing',
      entityId: doc._id.toString(),
      metadata: { title: doc.title, price: doc.price, unit: doc.unit },
    });
    return serializeListing(doc);
  },

  async getMine(
    providerId: string,
    query: ListingQuery,
  ): Promise<Paginated<ReturnType<typeof serializeListing>>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));

    const [items, total] = await Promise.all([
      ProviderListingModel.find({ providerId })
        .populate('providerId', PROVIDER_SELECT)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ProviderListingModel.countDocuments({ providerId }),
    ]);
    return {
      items: items.map(serializeListing),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /** Public marketplace feed — only listings marked available. */
  async getFeed(query: ListingQuery): Promise<Paginated<ReturnType<typeof serializeListing>>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 12));

    const match: FilterQuery<ProviderListingDocument> = { availability: 'available' };
    if (query.category) match.category = query.category;

    const [items, total] = await Promise.all([
      ProviderListingModel.find(match)
        .populate('providerId', PROVIDER_SELECT)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ProviderListingModel.countDocuments(match),
    ]);
    return {
      items: items.map(serializeListing),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async update(id: string, providerId: string, data: UpdateProviderListingInput) {
    const doc = await ProviderListingModel.findById(id);
    if (!doc) throw new NotFoundError('Listing not found');
    if (doc.providerId.toString() !== providerId) {
      throw new AuthorizationError('Only the owner can edit this listing');
    }
    Object.assign(doc, data);
    await doc.save();
    return serializeListing(doc);
  },

  async remove(id: string, providerId: string) {
    const doc = await ProviderListingModel.findById(id);
    if (!doc) throw new NotFoundError('Listing not found');
    if (doc.providerId.toString() !== providerId) {
      throw new AuthorizationError('Only the owner can delete this listing');
    }
    await doc.deleteOne();
    await ActivityService.log({
      actorId: providerId,
      action: 'listing.deleted',
      entityType: 'ProviderListing',
      entityId: id,
      metadata: { title: doc.title },
    });
    return { id, deleted: true };
  },
};

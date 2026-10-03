import { ActivityLogModel } from '../models/ActivityLogModel.js';
import { logger } from '../utils/logger.js';

export interface ActivityEntry {
  actorId?: string;
  actorEmail?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Records an audit event. Never throws — logging must not break requests. */
export const ActivityService = {
  async log(entry: ActivityEntry): Promise<void> {
    try {
      await ActivityLogModel.create(entry);
    } catch (err) {
      logger.warn('activity log write failed', { error: (err as Error).message });
    }
  },

  async list(query: { action?: string; actorEmail?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 30));
    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = query.action;
    if (query.actorEmail) filter.actorEmail = new RegExp(query.actorEmail, 'i');

    const [items, total] = await Promise.all([
      ActivityLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ActivityLogModel.countDocuments(filter),
    ]);
    return {
      items: items.map((doc) => ({
        id: doc._id.toString(),
        actorId: doc.actorId?.toString(),
        actorEmail: doc.actorEmail,
        action: doc.action,
        entityType: doc.entityType,
        entityId: doc.entityId,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },
};

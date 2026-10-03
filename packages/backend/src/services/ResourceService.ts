import type { CreateResourceInput, ResourceStatus, UpdateResourceInput } from '@alpha/shared';
import type { FilterQuery } from 'mongoose';
import { type ResourceDocument, ResourceModel } from '../models/ResourceModel.js';
import { AuthorizationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { sanitizeHtmlContent } from '../utils/sanitize.js';
import { NotificationService } from './NotificationService.js';
import { assertTransition } from './fsm.js';

export interface FeedQuery {
  page?: number;
  limit?: number;
  category?: string;
  tag?: string;
  authorId?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function serializeResource(doc: ResourceDocument | Record<string, unknown>) {
  // Works for both Mongoose documents and plain aggregation results.
  const obj =
    typeof (doc as ResourceDocument).toObject === 'function'
      ? (doc as ResourceDocument).toObject()
      : (doc as Record<string, unknown>);
  return {
    id: obj._id.toString(),
    title: obj.title,
    slug: obj.slug,
    content: obj.content,
    excerpt: obj.excerpt,
    authorId: obj.authorId?.toString(),
    category: obj.category,
    tags: obj.tags,
    metadata: obj.metadata,
    status: obj.status,
    viewCount: obj.viewCount,
    upvoteCount: obj.upvoteCount,
    publishedAt: obj.publishedAt,
    scheduledAt: obj.scheduledAt,
    versionHistory: obj.versionHistory,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

const EDITABLE_STATUSES: ResourceStatus[] = ['draft', 'changes_requested'];

function versionEntry(doc: ResourceDocument, userId: string, comment?: string) {
  doc.versionHistory.push({
    status: doc.status,
    userId,
    comment,
    timestamp: new Date(),
  });
}

export const ResourceService = {
  async create(data: CreateResourceInput, authorId: string) {
    // Resources always start as drafts — the FSM forbids skipping ahead.
    const doc = await ResourceModel.create({
      ...data,
      authorId,
      status: 'draft',
      content: sanitizeHtmlContent(data.content),
      versionHistory: [
        {
          status: 'draft' as ResourceStatus,
          userId: authorId,
          comment: 'Created',
          timestamp: new Date(),
        },
      ],
    });
    logger.info('resource created', { resourceId: doc._id.toString(), authorId });
    return serializeResource(doc);
  },

  async getById(id: string, opts: { incrementView?: boolean } = {}) {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');
    if (opts.incrementView) {
      doc.viewCount += 1;
      await doc.save();
    }
    return serializeResource(doc);
  },

  async getBySlug(slug: string) {
    const doc = await ResourceModel.findOne({ slug, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');
    return serializeResource(doc);
  },

  async update(id: string, actor: { id: string; role: string }, data: UpdateResourceInput) {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');

    const isAuthor = doc.authorId.toString() === actor.id;
    const isStaff = actor.role === 'admin' || actor.role === 'moderator';
    if (!isAuthor && !isStaff) {
      throw new AuthorizationError('Only the author or staff can edit this resource');
    }
    if (!EDITABLE_STATUSES.includes(doc.status) && !isStaff) {
      throw new ConflictError(`Cannot edit a resource in status "${doc.status}"`);
    }

    Object.assign(doc, data);
    if (data.content !== undefined) doc.content = sanitizeHtmlContent(data.content);
    versionEntry(doc, actor.id, 'Updated content');
    await doc.save();
    return serializeResource(doc);
  },

  /** Soft delete: flags the doc; feed/read queries exclude it. */
  async softDelete(id: string, userId: string) {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');
    if (doc.authorId.toString() !== userId) {
      throw new AuthorizationError('Only the author can delete this resource');
    }
    doc.deletedAt = new Date();
    doc.deletedBy = userId as unknown as ResourceDocument['deletedBy'];
    await doc.save();
    return { id, deleted: true };
  },

  async submitForReview(id: string, userId: string) {
    const doc = await this.requireOwned(id, userId);
    assertTransition(doc.status, 'pending_review');
    doc.status = 'pending_review';
    versionEntry(doc, userId, 'Submitted for review');
    await doc.save();
    return serializeResource(doc);
  },

  async startReview(id: string, editorId: string) {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');
    assertTransition(doc.status, 'reviewing');
    doc.status = 'reviewing';
    versionEntry(doc, editorId, 'Review started');
    await doc.save();
    return serializeResource(doc);
  },

  /** Approves a pending/reviewing resource; publishes immediately when unscheduled. */
  async approve(id: string, editorId: string) {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');

    if (doc.status === 'pending_review') {
      assertTransition(doc.status, 'reviewing');
      doc.status = 'reviewing';
    }
    assertTransition(doc.status, 'approved');
    doc.status = 'approved';

    const isScheduled = doc.scheduledAt && doc.scheduledAt.getTime() > Date.now();
    if (!isScheduled) {
      assertTransition(doc.status, 'published');
      doc.status = 'published';
      doc.publishedAt = new Date();
    }
    versionEntry(doc, editorId, isScheduled ? 'Approved (scheduled)' : 'Approved and published');
    await doc.save();

    await NotificationService.push(doc.authorId.toString(), 'resource', {
      resourceId: doc._id.toString(),
      message: `Your resource "${doc.title}" was approved`,
    });
    return serializeResource(doc);
  },

  async requestChanges(id: string, editorId: string, notes?: string) {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');
    if (doc.status !== 'pending_review' && doc.status !== 'reviewing') {
      throw new ConflictError(`Cannot request changes from status "${doc.status}"`);
    }
    assertTransition(doc.status, 'changes_requested');
    doc.status = 'changes_requested';
    versionEntry(doc, editorId, notes ?? 'Changes requested');
    await doc.save();
    return serializeResource(doc);
  },

  async reject(id: string, editorId: string, reason?: string) {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');
    if (doc.status !== 'pending_review' && doc.status !== 'reviewing') {
      throw new ConflictError(`Cannot reject from status "${doc.status}"`);
    }
    assertTransition(doc.status, 'rejected');
    doc.status = 'rejected';
    versionEntry(doc, editorId, reason ?? 'Rejected');
    await doc.save();
    return serializeResource(doc);
  },

  /** Published feed with pagination via $facet. */
  async getFeed(query: FeedQuery): Promise<Paginated<ReturnType<typeof serializeResource>>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 10));

    const match: FilterQuery<ResourceDocument> = {
      status: 'published',
      deletedAt: null,
    };
    if (query.category) match.category = query.category;
    if (query.tag) match.tags = query.tag;
    if (query.authorId) match.authorId = query.authorId;

    const [result] = await ResourceModel.aggregate<{
      metadata: { total: number }[];
      data: ResourceDocument[];
    }>([
      { $match: match },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $sort: { publishedAt: -1, _id: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
        },
      },
    ]);

    const total = result?.metadata[0]?.total ?? 0;
    const items = (result?.data ?? []).map((doc) => serializeResource(doc as ResourceDocument));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async getMine(userId: string, page = 1, limit = 10) {
    const [items, total] = await Promise.all([
      ResourceModel.find({ authorId: userId, deletedAt: null })
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ResourceModel.countDocuments({ authorId: userId, deletedAt: null }),
    ]);
    return {
      items: items.map(serializeResource),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /** Admin view of all resources with optional status filter. */
  async getAllForAdmin(status: ResourceStatus | undefined, page = 1, limit = 20) {
    const match: FilterQuery<ResourceDocument> = { deletedAt: null };
    if (status) match.status = status;

    const [items, total] = await Promise.all([
      ResourceModel.find(match)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ResourceModel.countDocuments(match),
    ]);
    return {
      items: items.map(serializeResource),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async requireOwned(id: string, userId: string): Promise<ResourceDocument> {
    const doc = await ResourceModel.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundError('Resource not found');
    if (doc.authorId.toString() !== userId) {
      throw new AuthorizationError('Only the author can perform this action');
    }
    return doc;
  },
};

import { NotificationModel } from '../models/NotificationModel.js';
import { emitToUser } from '../socket/index.js';
import { NotFoundError } from '../utils/errors.js';

export interface NotificationInput {
  type?: 'resource' | 'comment' | 'vote' | 'order' | 'system';
  message: string;
  resourceId?: string;
}

export const NotificationService = {
  async push(userId: string, type: NotificationInput['type'], input: NotificationInput) {
    const doc = await NotificationModel.create({
      userId,
      type: input.type ?? type ?? 'system',
      message: input.message,
      resourceId: input.resourceId,
      read: false,
    });
    emitToUser(userId, 'notification:push', {
      id: doc._id.toString(),
      type: doc.type,
      message: doc.message,
      resourceId: doc.resourceId?.toString(),
      createdAt: doc.createdAt,
    });
    return doc;
  },

  async listForUser(userId: string, limit = 20) {
    const [items, unread] = await Promise.all([
      NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(limit),
      NotificationModel.countDocuments({ userId, read: false }),
    ]);
    return {
      items: items.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        message: n.message,
        resourceId: n.resourceId?.toString(),
        read: n.read,
        createdAt: n.createdAt,
      })),
      unread,
    };
  },

  async markRead(notificationId: string, userId: string) {
    const doc = await NotificationModel.findOne({ _id: notificationId, userId });
    if (!doc) throw new NotFoundError('Notification not found');
    doc.read = true;
    await doc.save();
    return { id: doc._id.toString(), read: true };
  },

  async markAllRead(userId: string) {
    await NotificationModel.updateMany({ userId, read: false }, { $set: { read: true } });
    return { ok: true };
  },
};

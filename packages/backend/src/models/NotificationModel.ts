import mongoose, { type Document, Schema } from 'mongoose';

export interface NotificationDocument extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'resource' | 'comment' | 'vote' | 'order' | 'system';
  message: string;
  resourceId?: mongoose.Types.ObjectId;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['resource', 'comment', 'vote', 'order', 'system'],
      default: 'system',
    },
    message: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId, ref: 'Resource' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const NotificationModel = mongoose.model<NotificationDocument>(
  'Notification',
  notificationSchema,
);

import mongoose, { type Document, Schema } from 'mongoose';

export interface ActivityLogDocument extends Document {
  actorId?: mongoose.Types.ObjectId;
  actorEmail?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const activityLogSchema = new Schema<ActivityLogDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorEmail: { type: String, lowercase: true, trim: true },
    action: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Query indexes
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ actorId: 1, createdAt: -1 });

export const ActivityLogModel = mongoose.model<ActivityLogDocument>(
  'ActivityLog',
  activityLogSchema,
);

import { randomBytes } from 'node:crypto';
import { type ResourceStatus, ResourceStatusEnum, type VersionEntry } from '@alpha/shared';
import mongoose, { type Document, Schema } from 'mongoose';
import slugify from 'slugify';

export interface ResourceDocument extends Document {
  title: string;
  slug?: string;
  content: string;
  excerpt?: string;
  authorId: mongoose.Types.ObjectId;
  category: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  status: ResourceStatus;
  viewCount: number;
  upvoteCount: number;
  publishedAt?: Date;
  scheduledAt?: Date;
  versionHistory: VersionEntry[];
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const versionEntrySchema = new Schema<VersionEntry>(
  {
    status: { type: String, enum: ResourceStatusEnum.options, required: true },
    userId: { type: String, required: true },
    comment: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const resourceSchema = new Schema<ResourceDocument>(
  {
    title: { type: String, required: true, minlength: 5, maxlength: 200, trim: true },
    slug: { type: String, unique: true, sparse: true },
    content: { type: String, required: true, minlength: 10 },
    excerpt: { type: String, maxlength: 300 },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    tags: [{ type: String }],
    metadata: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ResourceStatusEnum.options,
      default: 'draft',
      required: true,
    },
    viewCount: { type: Number, default: 0 },
    upvoteCount: { type: Number, default: 0 },
    publishedAt: { type: Date },
    scheduledAt: { type: Date },
    versionHistory: { type: [versionEntrySchema], default: [] },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Query indexes
resourceSchema.index({ status: 1, publishedAt: -1 }); // feed queries
resourceSchema.index({ deletedAt: 1 }); // soft-delete filtering
resourceSchema.index({ slug: 1 }, { unique: true }); // slug lookup
resourceSchema.index({ tags: 1 }); // tag filtering
resourceSchema.index({ authorId: 1, status: 1 }); // dashboard queries
resourceSchema.index({ category: 1, status: 1 });

// Auto-generate slug from title; append a short random suffix on collision.
resourceSchema.pre('save', async function (next) {
  if (!this.isModified('title') && this.slug) return next();

  const base = slugify(this.title, { lower: true, strict: true, trim: true }) || 'resource';
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await mongoose.model('Resource').findOne({ slug });
    if (!existing) break;
    slug = `${base}-${randomBytes(3).toString('hex')}`;
  }
  this.slug = slug;
  next();
});

export const ResourceModel = mongoose.model<ResourceDocument>('Resource', resourceSchema);

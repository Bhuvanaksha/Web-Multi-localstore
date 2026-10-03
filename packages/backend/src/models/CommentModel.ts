import mongoose, { type Document, Schema } from 'mongoose';

export interface CommentDocument extends Document {
  resourceId: mongoose.Types.ObjectId;
  parentId: mongoose.Types.ObjectId | null;
  authorId: mongoose.Types.ObjectId;
  content: string;
  path: string;
  depth: number;
  upvoteCount: number;
  status: 'active' | 'hidden' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<CommentDocument>(
  {
    resourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, minlength: 1, maxlength: 2000 },
    path: { type: String, required: true },
    depth: { type: Number, default: 0 },
    upvoteCount: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'hidden', 'deleted'], default: 'active' },
  },
  { timestamps: true },
);

// Fast tree retrieval: all comments of a resource sorted by materialized path.
commentSchema.index({ resourceId: 1, path: 1 });
commentSchema.index({ parentId: 1 });

// Materialized path: root comments get path == own _id, replies append.
// Computed in pre('validate') because mongoose validates BEFORE save hooks
// run, and `path` is a required field.
commentSchema.pre('validate', async function (next) {
  if (!this.isNew) return next();

  const selfId = this._id.toString();

  if (!this.parentId) {
    this.depth = 0;
    this.path = selfId;
    return next();
  }

  try {
    const Parent = mongoose.model<CommentDocument>('Comment');
    const parent = await Parent.findById(this.parentId).select('path depth').lean();
    if (!parent) {
      return next(new Error('Parent comment not found'));
    }
    this.depth = parent.depth + 1;
    this.path = `${parent.path}.${selfId}`;
    next();
  } catch (err) {
    next(err as Error);
  }
});

export const CommentModel = mongoose.model<CommentDocument>('Comment', commentSchema);

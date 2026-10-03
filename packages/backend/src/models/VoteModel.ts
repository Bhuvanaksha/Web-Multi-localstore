import mongoose, { type Document, type Model, Schema } from 'mongoose';

export interface VoteDocument extends Document {
  userId: mongoose.Types.ObjectId;
  targetId: mongoose.Types.ObjectId;
  targetType: 'Resource' | 'Comment';
  value: 1 | -1;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoteCounts {
  upvotes: number;
  downvotes: number;
  score: number;
}

export interface VoteModel extends Model<VoteDocument> {
  /**
   * Idempotent, atomic toggle. If the user already voted with the same
   * value the vote is removed (toggle off); with a different value it is
   * updated. Returns the aggregated counts for the target.
   */
  toggleVote(
    userId: string,
    targetId: string,
    targetType: 'Resource' | 'Comment',
    value: 1 | -1,
  ): Promise<VoteCounts>;

  aggregateCounts(targetId: string, targetType: 'Resource' | 'Comment'): Promise<VoteCounts>;
}

const voteSchema = new Schema<VoteDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetType: { type: String, enum: ['Resource', 'Comment'], required: true },
    value: { type: Number, enum: [1, -1], required: true },
  },
  { timestamps: true },
);

// Critical: one vote per (user, target) — enforced at the DB level.
voteSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });

voteSchema.statics.toggleVote = async function (
  this: Model<VoteDocument>,
  userId: string,
  targetId: string,
  targetType: 'Resource' | 'Comment',
  value: 1 | -1,
): Promise<VoteCounts> {
  // Set the value atomically (creating the vote if needed) while returning
  // the *previous* document, then toggle off (delete) when the value is
  // unchanged. The unique index guarantees one vote per (user, target).
  const prev = await this.findOneAndUpdate(
    { userId, targetId, targetType },
    { $set: { userId, targetId, targetType, value } },
    { upsert: true, returnDocument: 'before' },
  );

  if (prev && prev.value === value) {
    await this.deleteOne({ userId, targetId, targetType });
  }

  const self = this as unknown as VoteModel;
  return self.aggregateCounts(targetId, targetType);
};

voteSchema.statics.aggregateCounts = async function (
  this: Model<VoteDocument>,
  targetId: string,
  targetType: 'Resource' | 'Comment',
): Promise<VoteCounts> {
  const [result] = await this.aggregate<{ upvotes: number; downvotes: number; score: number }>([
    { $match: { targetId: new mongoose.Types.ObjectId(targetId), targetType } },
    {
      $group: {
        _id: null,
        upvotes: {
          $sum: { $cond: [{ $eq: ['$value', 1] }, 1, 0] },
        },
        downvotes: {
          $sum: { $cond: [{ $eq: ['$value', -1] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        upvotes: 1,
        downvotes: 1,
        score: { $subtract: ['$upvotes', '$downvotes'] },
      },
    },
  ]);
  return result ?? { upvotes: 0, downvotes: 0, score: 0 };
};

export const VoteModel = mongoose.model<VoteDocument, VoteModel>('Vote', voteSchema);

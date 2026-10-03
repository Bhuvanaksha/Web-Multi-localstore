import { CommentModel } from '../models/CommentModel.js';
import { ResourceModel } from '../models/ResourceModel.js';
import { type VoteCounts, VoteModel } from '../models/VoteModel.js';
import { emitToRoom } from '../socket/index.js';
import { NotFoundError } from '../utils/errors.js';

export const VoteService = {
  /**
   * Idempotent toggle: voting again with the same value removes the vote.
   * Emits `vote:update` to the resource room with the new counts.
   */
  async toggle(
    userId: string,
    targetId: string,
    targetType: 'Resource' | 'Comment',
    value: 1 | -1,
  ): Promise<{ targetId: string; targetType: string; counts: VoteCounts }> {
    let resourceId = targetId;

    if (targetType === 'Resource') {
      const resource = await ResourceModel.findOne({ _id: targetId, deletedAt: null });
      if (!resource) throw new NotFoundError('Resource not found');
      resourceId = targetId;
    } else {
      const comment = await CommentModel.findById(targetId);
      if (!comment) throw new NotFoundError('Comment not found');
      resourceId = comment.resourceId.toString();
    }

    const counts = await VoteModel.toggleVote(userId, targetId, targetType, value);

    if (targetType === 'Resource') {
      await ResourceModel.updateOne({ _id: targetId }, { $set: { upvoteCount: counts.score } });
    } else {
      await CommentModel.updateOne({ _id: targetId }, { $set: { upvoteCount: counts.score } });
    }

    emitToRoom(`resource:${resourceId}`, 'vote:update', {
      targetId,
      targetType,
      counts,
    });

    return { targetId, targetType, counts };
  },

  async getCounts(targetId: string, targetType: 'Resource' | 'Comment'): Promise<VoteCounts> {
    return VoteModel.aggregateCounts(targetId, targetType);
  },
};

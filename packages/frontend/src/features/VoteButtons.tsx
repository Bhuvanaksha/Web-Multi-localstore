import { useVoteMutation } from '../hooks/useVoteMutation';
import { cx } from '../lib/utils';
import { useAuthStore } from '../stores/useAuthStore';

export interface VoteButtonsProps {
  targetId: string;
  score: number;
  compact?: boolean;
}

export function VoteButtons({ targetId, score, compact = false }: VoteButtonsProps) {
  const user = useAuthStore((s) => s.user);
  const vote = useVoteMutation(targetId);

  if (!user) {
    return (
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {score} pts
      </span>
    );
  }

  return (
    <div className="flex" style={{ gap: '0.4rem' }}>
      <button
        type="button"
        className="vote-btn"
        disabled={vote.isPending}
        onClick={() => vote.mutate(1)}
        aria-label="Upvote"
      >
        ▲ <span data-testid="vote-score">{score}</span>
      </button>
      <button
        type="button"
        className={cx('vote-btn')}
        disabled={vote.isPending}
        onClick={() => vote.mutate(-1)}
        aria-label="Downvote"
      >
        ▼
      </button>
    </div>
  );
}

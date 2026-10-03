import { useState } from 'react';
import type { CommentNode } from '../hooks/useComments';
import { timeAgo } from '../lib/utils';
import { Avatar } from '../shared/ui/Avatar';
import { useAuthStore } from '../stores/useAuthStore';
import { CommentForm } from './CommentForm';

export interface CommentThreadProps {
  comments: CommentNode[];
  resourceId: string;
}

export function CommentThread({ comments, resourceId }: CommentThreadProps) {
  if (comments.length === 0) {
    return <p className="muted">No comments yet — be the first!</p>;
  }
  return (
    <div>
      {comments.map((c) => (
        <CommentNodeView key={c.id} comment={c} resourceId={resourceId} />
      ))}
    </div>
  );
}

function CommentNodeView({ comment, resourceId }: { comment: CommentNode; resourceId: string }) {
  const user = useAuthStore((s) => s.user);
  const [replying, setReplying] = useState(false);

  return (
    <div className="comment" style={{ paddingLeft: `${Math.min(comment.depth, 6) * 0.75 + 1}rem` }}>
      <div className="comment-meta">
        <Avatar name={comment.authorId.slice(-4)} size="sm" />
        <span>user_{comment.authorId.slice(-4)}</span>
        <span>·</span>
        <span>{timeAgo(comment.createdAt ?? new Date().toISOString())}</span>
      </div>
      <p style={{ margin: '0.35rem 0' }}>
        {comment.status === 'deleted' ? <em className="muted">[deleted]</em> : comment.content}
      </p>
      {user && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setReplying((v) => !v)}
        >
          Reply
        </button>
      )}
      {replying && (
        <CommentForm
          resourceId={resourceId}
          parentId={comment.id}
          onDone={() => setReplying(false)}
          autoFocus
        />
      )}
      {comment.children.length > 0 && (
        <CommentThread comments={comment.children} resourceId={resourceId} />
      )}
    </div>
  );
}

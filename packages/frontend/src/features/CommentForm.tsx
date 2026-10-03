import { type FormEvent, useState } from 'react';
import { useCreateComment } from '../hooks/useComments';
import { Button } from '../shared/ui/Button';
import { toastError, toastSuccess } from '../shared/ui/Toast';

export interface CommentFormProps {
  resourceId: string;
  parentId?: string | null;
  onDone?: () => void;
  autoFocus?: boolean;
}

export function CommentForm({ resourceId, parentId = null, onDone, autoFocus }: CommentFormProps) {
  const [content, setContent] = useState('');
  const createComment = useCreateComment(resourceId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    try {
      await createComment.mutateAsync({ parentId, content: trimmed });
      setContent('');
      toastSuccess('Comment posted');
      onDone?.();
    } catch (err) {
      toastError('Failed to post comment');
    }
  };

  return (
    <form onSubmit={submit} className="mb-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a comment…"
        rows={3}
        autoFocus={autoFocus}
        maxLength={2000}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div className="spread">
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          {content.length}/2000
        </span>
        <Button
          type="submit"
          size="sm"
          loading={createComment.isPending}
          disabled={!content.trim()}
        >
          {parentId ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </form>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { useContext, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';
import { SocketContext, useSocketEvent } from '../context/SocketContext';
import { CommentForm } from '../features/CommentForm';
import { CommentThread } from '../features/CommentThread';
import { VoteButtons } from '../features/VoteButtons';
import { useComments } from '../hooks/useComments';
import { useResourceDetail } from '../hooks/useResourceDetail';
import { formatDate } from '../lib/utils';
import { Card } from '../shared/ui/Card';
import { Skeleton } from '../shared/ui/Skeleton';
import { useAuthStore } from '../stores/useAuthStore';

export function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const socket = useContext(SocketContext);
  const { data: resource, isLoading } = useResourceDetail(id ?? '');

  // Join the resource room while the page is open (presence + realtime).
  useEffect(() => {
    if (!socket || !resource?.id) return;
    socket.emit('subscribe:resource', resource.id);
    return () => {
      socket.emit('unsubscribe:resource', resource.id);
    };
  }, [socket, resource?.id]);

  // Table of contents from h2/h3 headings
  const toc = useMemo(() => {
    if (!resource) return [];
    const div = document.createElement('div');
    div.innerHTML = resource.content;
    return Array.from(div.querySelectorAll('h2, h3')).map((el) => ({
      text: el.textContent ?? '',
      level: el.tagName === 'H2' ? 2 : 3,
    }));
  }, [resource?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time: vote counts
  useSocketEvent('vote:update', (data: { targetId: string; counts: { score: number } }) => {
    if (data.targetId !== resource?.id) return;
    queryClient.setQueryData(['resource', resource.id], (old: unknown) =>
      old ? { ...(old as object), upvoteCount: data.counts.score } : old,
    );
  });

  // Real-time: new comments prepended / attached
  useSocketEvent('comment:new', (comment: { resourceId: string; id: string }) => {
    if (comment.resourceId !== resource?.id) return;
    queryClient.invalidateQueries({ queryKey: ['comments', resource.id] });
  });

  const { data: comments } = useComments(resource?.id ?? '');

  if (isLoading || !resource) {
    return (
      <div className="page">
        <Skeleton height="2rem" width="60%" />
        <Skeleton height="1rem" width="30%" style={{ marginTop: '0.75rem' }} />
        <Skeleton height="12rem" style={{ marginTop: '1rem' }} />
      </div>
    );
  }

  const safeHtml = DOMPurify.sanitize(resource.content);

  return (
    <>
      <Helmet>
        <title>{resource.title} — Alpha</title>
        <meta name="description" content={resource.excerpt ?? resource.title} />
        <meta property="og:title" content={resource.title} />
        <meta property="og:description" content={resource.excerpt ?? resource.title} />
      </Helmet>
      <div className="page">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '2rem' }}>
          <article>
            <div className="flex mb-1">
              <span className="chip">{resource.category}</span>
              {resource.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                </span>
              ))}
            </div>
            <h1 className="mt-0">{resource.title}</h1>
            <p className="muted">
              Published {formatDate(resource.publishedAt)} · {resource.viewCount} views
            </p>
            <VoteButtons targetId={resource.id} score={resource.upvoteCount} />{' '}
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized server-side and again by DOMPurify below */}
            <div className="article-body" dangerouslySetInnerHTML={{ __html: safeHtml }} />
            <hr
              style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }}
            />
            <h2>Comments ({comments?.length ?? 0})</h2>
            {user ? (
              <CommentForm resourceId={resource.id} />
            ) : (
              <p className="muted">Log in to join the discussion.</p>
            )}
            {comments && <CommentThread comments={comments} resourceId={resource.id} />}
          </article>

          {toc.length > 0 && (
            <aside className="toc">
              <strong className="muted">On this page</strong>
              <ul>
                {toc.map((item, i) => (
                  <li key={`${item.text}-${i}`} style={{ paddingLeft: item.level === 3 ? 8 : 0 }}>
                    <a href={`#${slugifyHeading(item.text)}`}>{item.text}</a>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

import { Link } from 'react-router-dom';
import type { ResourceListItem } from '../hooks/useResources';
import { formatDate } from '../lib/utils';
import { Card } from '../shared/ui/Card';
import { VoteButtons } from './VoteButtons';

export function ResourceCard({ resource }: { resource: ResourceListItem }) {
  return (
    <Card padded interactive>
      <div className="flex spread">
        <span className="chip">{resource.category}</span>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          {formatDate(resource.publishedAt ?? resource.createdAt)}
        </span>
      </div>
      <Link to={`/resources/${resource.slug ?? resource.id}`}>
        <h2 style={{ margin: '0.6rem 0 0.4rem', fontSize: '1.15rem' }}>{resource.title}</h2>
      </Link>
      {resource.excerpt && (
        <p className="muted" style={{ margin: '0 0 0.75rem' }}>
          {resource.excerpt}
        </p>
      )}
      <div className="flex spread">
        <div className="flex" style={{ gap: '0.4rem' }}>
          {resource.tags.slice(0, 3).map((t) => (
            <span key={t} className="chip">
              #{t}
            </span>
          ))}
        </div>
        <div className="flex" style={{ gap: '0.8rem' }}>
          <VoteButtons targetId={resource.id} score={resource.upvoteCount} compact />
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            👁 {resource.viewCount}
          </span>
        </div>
      </div>
    </Card>
  );
}

import { useSearchParams } from 'react-router-dom';
import { ResourceCard } from '../features/ResourceCard';
import { useSearchQuery } from '../hooks/useSearch';
import { Skeleton } from '../shared/ui/Skeleton';

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const { data, isLoading } = useSearchQuery(q);

  return (
    <div className="page">
      <h1 className="mt-0">
        Results for “{q}”{' '}
        {data && (
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            ({data.total} found · {data.engine} engine)
          </span>
        )}
      </h1>

      {isLoading ? (
        <div className="grid">
          <Skeleton height="6rem" />
          <Skeleton height="6rem" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="muted">No results. Try different keywords.</p>
      ) : (
        <div className="grid">
          {data.items.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </div>
      )}
    </div>
  );
}

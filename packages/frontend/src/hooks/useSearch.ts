import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Paginated, ResourceListItem } from './useResources';

export interface SearchResult extends Paginated<ResourceListItem> {
  engine: 'atlas' | 'regex';
}

export function useSearchQuery(query: string, page = 1) {
  return useQuery({
    queryKey: ['search', query, page],
    queryFn: () =>
      api
        .get<SearchResult>('/search', { params: { q: query, page, limit: 10 } })
        .then((r) => r.data),
    enabled: query.trim().length > 0,
  });
}

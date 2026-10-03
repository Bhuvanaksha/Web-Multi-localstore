import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface ResourceListItem {
  id: string;
  title: string;
  slug?: string;
  excerpt?: string;
  authorId?: string;
  category: string;
  tags: string[];
  upvoteCount: number;
  viewCount: number;
  status: string;
  publishedAt?: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FeedFilters {
  category?: string;
  tag?: string;
}

export function useResourcesQuery(filters: FeedFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['resources', filters],
    queryFn: ({ pageParam }) =>
      api
        .get<Paginated<ResourceListItem>>('/resources', {
          params: { page: pageParam, limit: 10, ...filters },
        })
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}

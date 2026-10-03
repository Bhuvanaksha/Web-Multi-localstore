import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface ResourceDetail {
  id: string;
  title: string;
  slug?: string;
  content: string;
  excerpt?: string;
  authorId: string;
  category: string;
  tags: string[];
  status: string;
  viewCount: number;
  upvoteCount: number;
  publishedAt?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function useResourceDetail(id: string) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () =>
      api.get<{ resource: ResourceDetail }>(`/resources/${id}`).then((r) => r.data.resource),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}

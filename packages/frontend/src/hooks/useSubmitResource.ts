import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ResourceDetail } from './useResourceDetail';

export interface SubmitResourceInput {
  title: string;
  content: string;
  excerpt?: string;
  category: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export function useSubmitResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitResourceInput) =>
      api.post<{ resource: ResourceDetail }>('/resources', input).then((r) => r.data.resource),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

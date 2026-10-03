import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ResourceDetail } from './useResourceDetail';

export interface VoteCounts {
  upvotes: number;
  downvotes: number;
  score: number;
}

export interface VoteResult {
  targetId: string;
  targetType: 'Resource' | 'Comment';
  counts: VoteCounts;
}

export function useVoteMutation(targetId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: 1 | -1) =>
      api
        .post<VoteResult>('/votes/toggle', { targetId, targetType: 'Resource', value })
        .then((r) => r.data),
    // Optimistic: apply the delta before the server responds.
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: ['resource', targetId] });
      const previous = queryClient.getQueryData<ResourceDetail>(['resource', targetId]);

      queryClient.setQueryData<ResourceDetail>(['resource', targetId], (old) => {
        if (!old) return old;
        // Simple toggle: +1 for the current action; the server response
        // reconciles the exact score afterwards.
        return { ...old, upvoteCount: old.upvoteCount + value };
      });
      return { previous };
    },
    onError: (_err, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['resource', targetId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['resource', targetId] });
    },
  });
}

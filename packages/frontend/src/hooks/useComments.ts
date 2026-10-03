import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface CommentNode {
  id: string;
  resourceId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  path: string;
  depth: number;
  upvoteCount: number;
  status: 'active' | 'hidden' | 'deleted';
  createdAt?: string;
  children: CommentNode[];
}

export function useComments(resourceId: string) {
  return useQuery({
    queryKey: ['comments', resourceId],
    queryFn: () =>
      api
        .get<{ comments: CommentNode[] }>(`/resources/${resourceId}/comments`)
        .then((r) => r.data.comments),
    enabled: Boolean(resourceId),
  });
}

export function useCreateComment(resourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentId: string | null; content: string }) =>
      api
        .post<{ comment: CommentNode }>('/comments', { resourceId, ...input })
        .then((r) => r.data.comment),
    onSuccess: (comment) => {
      queryClient.setQueryData<CommentNode[]>(['comments', resourceId], (old) => {
        if (!old) return [comment];
        if (!comment.parentId) return [comment, ...old];
        const attach = (nodes: CommentNode[]): CommentNode[] =>
          nodes.map((n) =>
            n.id === comment.parentId
              ? { ...n, children: [...n.children, comment] }
              : { ...n, children: attach(n.children) },
          );
        return attach(old);
      });
    },
  });
}

import { z } from 'zod';

export const CommentSchema = z.object({
  id: z.string().optional(),
  resourceId: z.string(),
  parentId: z.string().nullable(),
  authorId: z.string(),
  content: z.string().min(1).max(2000),
  path: z.string(),
  depth: z.number(),
  upvoteCount: z.number().default(0),
  status: z.enum(['active', 'hidden', 'deleted']).default('active'),
  createdAt: z.date().optional(),
});

export const CreateCommentSchema = z.object({
  resourceId: z.string(),
  parentId: z.string().nullable(),
  content: z.string().min(1).max(2000),
});

export type Comment = z.infer<typeof CommentSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

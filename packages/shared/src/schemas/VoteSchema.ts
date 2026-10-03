import { z } from 'zod';

export const VoteSchema = z.object({
  userId: z.string(),
  targetId: z.string(),
  targetType: z.enum(['Resource', 'Comment']),
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const VoteInputSchema = VoteSchema.pick({
  targetId: true,
  targetType: true,
  value: true,
});

export type Vote = z.infer<typeof VoteSchema>;
export type VoteInput = z.infer<typeof VoteInputSchema>;

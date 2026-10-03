import { z } from 'zod';
import { ResourceStatusEnum } from '../enums/ResourceStatusEnum.js';

export const VersionEntrySchema = z.object({
  status: ResourceStatusEnum,
  userId: z.string(),
  comment: z.string().optional(),
  timestamp: z.date(),
});

export const ResourceSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(5).max(200),
  slug: z.string().optional(),
  content: z.string().min(10),
  excerpt: z.string().max(300).optional(),
  authorId: z.string(),
  category: z.string().min(1),
  tags: z.array(z.string()),
  metadata: z.record(z.any()).optional(),
  status: ResourceStatusEnum,
  viewCount: z.number().default(0),
  upvoteCount: z.number().default(0),
  publishedAt: z.date().optional(),
  scheduledAt: z.date().optional(),
  versionHistory: z.array(VersionEntrySchema),
});

export const CreateResourceSchema = ResourceSchema.omit({
  id: true,
  slug: true,
  authorId: true, // assigned server-side from the JWT
  viewCount: true,
  upvoteCount: true,
  versionHistory: true,
  publishedAt: true,
}).extend({
  status: ResourceStatusEnum.default('draft'),
});

export const UpdateResourceSchema = z
  .object({
    title: z.string().min(5).max(200).optional(),
    content: z.string().min(10).optional(),
    excerpt: z.string().max(300).optional(),
    category: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
    scheduledAt: z.date().optional(),
  })
  .strict();

export type Resource = z.infer<typeof ResourceSchema>;
export type CreateResourceInput = z.infer<typeof CreateResourceSchema>;
export type UpdateResourceInput = z.infer<typeof UpdateResourceSchema>;
export type VersionEntry = z.infer<typeof VersionEntrySchema>;

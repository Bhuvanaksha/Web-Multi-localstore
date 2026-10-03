import { z } from 'zod';

/**
 * Generic content lifecycle Finite State Machine.
 * Allowed transitions (enforced server-side, see backend/src/services/fsm.ts):
 *
 *   draft ──────────────> pending_review
 *   pending_review ─────> reviewing | rejected | changes_requested
 *   reviewing ──────────> approved | changes_requested | rejected
 *   changes_requested ──> pending_review
 *   approved ───────────> published | archived
 *   published ──────────> archived
 *   archived ───────────> published
 *   rejected ───────────> draft
 */
export const ResourceStatusEnum = z.enum([
  'draft',
  'pending_review',
  'reviewing',
  'changes_requested',
  'approved',
  'published',
  'archived',
  'rejected',
]);

export type ResourceStatus = z.infer<typeof ResourceStatusEnum>;

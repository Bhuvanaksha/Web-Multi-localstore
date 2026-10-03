import { type ResourceStatus, ResourceStatusEnum } from '@alpha/shared';
import { ConflictError } from '../utils/errors.js';

/**
 * Strict FSM for resource status. Invalid transitions are rejected with a
 * 409 Conflict (see assertTransition).
 */
export const RESOURCE_FSM: Record<ResourceStatus, readonly ResourceStatus[]> = {
  draft: ['pending_review'],
  pending_review: ['reviewing', 'rejected', 'changes_requested'],
  reviewing: ['approved', 'changes_requested', 'rejected'],
  changes_requested: ['pending_review'],
  approved: ['published', 'archived'],
  published: ['archived'],
  archived: ['published'],
  rejected: ['draft'],
};

export function getAllowedTransitions(status: ResourceStatus): readonly ResourceStatus[] {
  return RESOURCE_FSM[status] ?? [];
}

/** Throws ConflictError (409) when `current -> next` is not a legal transition. */
export function assertTransition(current: ResourceStatus, next: ResourceStatus): void {
  if (!ResourceStatusEnum.options.includes(next)) {
    throw new ConflictError(`Invalid resource status "${next}"`);
  }
  const allowed = RESOURCE_FSM[current];
  if (!allowed || !allowed.includes(next)) {
    throw new ConflictError(`Invalid transition: ${current} -> ${next}`);
  }
}

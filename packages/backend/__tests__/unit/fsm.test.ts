import { describe, expect, it } from 'vitest';
import { RESOURCE_FSM, assertTransition, getAllowedTransitions } from '../../src/services/fsm.js';
import { ConflictError } from '../../src/utils/errors.js';

describe('Resource FSM', () => {
  it('allows the happy path draft -> pending_review -> reviewing -> approved -> published', () => {
    expect(() => assertTransition('draft', 'pending_review')).not.toThrow();
    expect(() => assertTransition('pending_review', 'reviewing')).not.toThrow();
    expect(() => assertTransition('reviewing', 'approved')).not.toThrow();
    expect(() => assertTransition('approved', 'published')).not.toThrow();
  });

  it('throws ConflictError for draft -> published (skipping review)', () => {
    expect(() => assertTransition('draft', 'published')).toThrow(ConflictError);
    expect(() => assertTransition('draft', 'published')).toThrow(/Invalid transition/);
  });

  it('throws ConflictError for published -> pending_review (no going backwards)', () => {
    expect(() => assertTransition('published', 'pending_review')).toThrow(ConflictError);
  });

  it('rejects unknown statuses', () => {
    expect(() => assertTransition('draft', 'on_fire' as never)).toThrow(ConflictError);
  });

  it('exposes allowed transitions per state', () => {
    expect(getAllowedTransitions('draft')).toEqual(['pending_review']);
    expect(getAllowedTransitions('pending_review').sort()).toEqual(
      ['reviewing', 'rejected', 'changes_requested'].sort(),
    );
    expect(getAllowedTransitions('published')).toEqual(['archived']);
  });

  it('every state maps to a known next-state list', () => {
    const states = Object.keys(RESOURCE_FSM);
    expect(states).toHaveLength(8);
    for (const next of Object.values(RESOURCE_FSM)) {
      for (const target of next) {
        expect(states).toContain(target);
      }
    }
  });
});

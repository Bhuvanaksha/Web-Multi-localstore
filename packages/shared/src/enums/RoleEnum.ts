import { z } from 'zod';

export const RoleEnum = z.enum(['guest', 'member', 'customer', 'provider', 'moderator', 'admin']);

export type Role = z.infer<typeof RoleEnum>;

export const roleOrder: Record<Role, number> = {
  guest: 0,
  member: 1,
  customer: 2,
  provider: 2,
  moderator: 3,
  admin: 4,
};

/** True when `required` is >= `actual` (roles are hierarchical). */
export function hasRole(actual: Role, required: Role): boolean {
  return roleOrder[actual] >= roleOrder[required];
}

/** Roles that may shop: customers, legacy members, and admins. */
export const BUYER_ROLES: readonly Role[] = ['customer', 'member', 'admin'];

/** Roles that may sell: providers, legacy members, and admins. */
export const SELLER_ROLES: readonly Role[] = ['provider', 'member', 'admin'];

/** Roles that may publish community resources (not customers or providers). */
export const AUTHOR_ROLES: readonly Role[] = ['member', 'moderator', 'admin'];

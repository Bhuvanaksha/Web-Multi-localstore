import type { Role } from '@alpha/shared';

/** May shop (place orders): customers, legacy members, admins. */
export function canBuy(role?: Role | null): boolean {
  return role === 'customer' || role === 'member' || role === 'admin';
}

/** May sell (create listings): providers, legacy members, admins. */
export function canSell(role?: Role | null): boolean {
  return role === 'provider' || role === 'member' || role === 'admin';
}

/** May publish community resources: members, moderators, admins. */
export function canPublish(role?: Role | null): boolean {
  return role === 'member' || role === 'moderator' || role === 'admin';
}

/** Default landing page after login/registration. */
export function homeForRole(role?: Role | null): string {
  if (role === 'provider') return '/provider';
  if (role === 'admin') return '/admin';
  return '/dashboard';
}

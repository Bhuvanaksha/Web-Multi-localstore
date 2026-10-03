import { ValidationError } from './errors.js';

/** The most commonly used (and thus trivially brute-forced) passwords. */
const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password1',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'abc123',
  'letmein',
  'welcome',
  'welcome123',
  'iloveyou',
  'admin',
  'admin123',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'master',
  'login',
  'princess',
  'shadow',
  'michael',
  'ninja',
  'mustang',
  'batman',
  'superman',
  'trustno1',
  'passw0rd',
  'zaq12wsx',
  '1q2w3e4r',
  'qazwsx',
  'asdfgh',
  'asdf1234',
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  'changeme',
  'changepassword',
  'default',
  'test',
  'test123',
  'demo',
  'demo123',
  // Longer variants that pass the length check but are still trivially common.
  'passwordpassword',
  'password123456',
  '123456789012',
  'qwerty123456',
  'iloveyou1234',
  'welcome123456',
  'adminadmin123',
  'letmein12345',
  'abcdefghijkl',
  'qwertyuiop123',
  '1234567890abc',
  'p@ssw0rd',
  'pa55word',
  'god',
  'jesus',
  'lovely',
  'whatever',
  'internet',
  'access',
  'hello',
  'hello123',
]);

/**
 * Rejects weak passwords: too short, on the common-password blacklist, or a
 * trivial permutation of the account's username/email. Throws ValidationError.
 */
export function assertStrongPassword(
  password: string,
  context?: { username?: string; email?: string },
): void {
  if (password.length < 12) {
    throw new ValidationError('Password must be at least 12 characters');
  }
  if (password.length > 128) {
    throw new ValidationError('Password must be at most 128 characters');
  }
  // Normalize both sides so punctuation/underscores can't hide a weak pattern.
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lowered = normalize(password);
  if (COMMON_PASSWORDS.has(lowered) || COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new ValidationError('That password is too common — choose a stronger one');
  }
  const normUsername = context?.username ? normalize(context.username) : '';
  if (normUsername.length >= 3 && lowered.includes(normUsername)) {
    throw new ValidationError('Password must not contain your username');
  }
  if (context?.email) {
    const localPart = normalize(context.email.split('@')[0] ?? '');
    if (localPart.length >= 3 && lowered.includes(localPart)) {
      throw new ValidationError('Password must not contain your email address');
    }
  }
  // A single repeated character (e.g. "aaaaaaaaaaaa") is trivially guessable.
  if (/^(.)\1+$/.test(password)) {
    throw new ValidationError('Password must not be a single repeated character');
  }
}

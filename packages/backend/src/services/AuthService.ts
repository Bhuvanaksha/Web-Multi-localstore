import { createHash, randomBytes } from 'node:crypto';
import type { RegisterInput, Role } from '@alpha/shared';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { config } from '../config/env.js';
import { PasswordResetTokenModel } from '../models/PasswordResetTokenModel.js';
import { RefreshTokenModel } from '../models/RefreshTokenModel.js';
import { type UserDocument, UserModel } from '../models/UserModel.js';
import { sendMail } from '../utils/email.js';
import { AppError, AuthenticationError, ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { assertStrongPassword } from '../utils/passwordPolicy.js';
import { ActivityService } from './ActivityService.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: Role;
  profile?: { firstName?: string; lastName?: string; bio?: string };
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt?: Date;
}

/** Login result — either full tokens, or an MFA challenge when the user has MFA on. */
export type LoginResult =
  | { user: PublicUser; tokens: AuthTokens; xsrfToken: string }
  | { mfaRequired: true; mfaChallengeToken: string };

/** Metadata attached to a new session (refresh token). */
export interface SessionMeta {
  device?: string;
  ip?: string;
}

/**
 * Email-driven role assignment:
 *   - `.local` addresses  → admin
 *   - addresses containing "store" or "groceries" → provider (seller)
 *   - anything else       → customer (buyer)
 */
export function roleFromEmail(email: string): 'admin' | 'provider' | 'customer' {
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith('.local')) return 'admin';
  if (/(store|groceries)/i.test(normalized)) return 'provider';
  return 'customer';
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    role: user.role,
    profile: user.profile,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt,
  };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user: Pick<UserDocument, '_id' | 'role' | 'username'>): string {
  return jwt.sign(
    { userId: user._id.toString(), role: user.role, username: user.username },
    config.accessTokenPrivateKey,
    { algorithm: 'RS256', expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] },
  );
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

/** Signs a short-lived token proving the password step of an MFA login. */
function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'mfa' }, config.accessTokenPrivateKey, {
    algorithm: 'RS256',
    expiresIn: '5m',
  });
}

/** Revokes every refresh token a user owns (password change / reset). */
async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await RefreshTokenModel.updateMany({ userId, revoked: false }, { $set: { revoked: true } });
}

/** Generates 10 single-use MFA recovery codes and returns them (plain). */
function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () =>
    randomBytes(6).toString('hex').toUpperCase().slice(0, 10),
  );
}

/** Emails the user about a security-sensitive event (no-op in dev, logged). */
async function sendSecurityAlert(
  user: Pick<UserDocument, 'email' | 'username'>,
  subject: string,
  details: string,
): Promise<void> {
  await sendMail({
    to: user.email,
    subject: `🔒 ${subject}`,
    text: `${details}\n\nIf this wasn't you, reset your password and enable MFA immediately.`,
    html: `<p>${details}</p><p>If this wasn't you, <strong>reset your password and enable MFA immediately.</strong></p>`,
  });
}

function verificationUrl(email: string): string {
  const verifyToken = jwt.sign({ email }, config.accessTokenPrivateKey, {
    algorithm: 'RS256',
    expiresIn: '24h',
  });
  return `${config.corsOrigins[0]}/verify?token=${verifyToken}`;
}

function resetUrl(rawToken: string): string {
  return `${config.corsOrigins[0]}/reset-password?token=${rawToken}`;
}

export const AuthService = {
  async register(input: RegisterInput): Promise<PublicUser> {
    const email = input.email.toLowerCase();

    const [emailExists, usernameExists] = await Promise.all([
      UserModel.exists({ email }),
      UserModel.exists({ username: input.username }),
    ]);
    if (emailExists) throw new ConflictError('Email is already registered');
    if (usernameExists) throw new ConflictError('Username is already taken');

    assertStrongPassword(input.password, { username: input.username, email });

    // Role comes from the email address (admin for .local, provider for
    // store/groceries addresses, customer otherwise) — never from the client.
    const role = roleFromEmail(email);
    const user = await UserModel.create({
      email,
      username: input.username,
      password: input.password,
      profile: input.profile,
      role,
      emailVerified: role === 'admin', // internal .local accounts are trusted
    });

    await sendMail({
      to: email,
      subject: 'Verify your email',
      text: `Welcome! Verify your email address: ${verificationUrl(email)}`,
      html: `<p>Welcome! <a href="${verificationUrl(email)}">Verify your email address</a>.</p>`,
    });

    logger.info('user registered', { userId: user._id.toString(), role });
    await ActivityService.log({
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'auth.registered',
      entityType: 'User',
      entityId: user._id.toString(),
    });
    return toPublicUser(user);
  },

  async login(email: string, password: string, meta?: SessionMeta): Promise<LoginResult> {
    const user = await UserModel.findByCredentials(email, password);
    const ip = meta?.ip;

    // Password was correct — if the user has MFA enabled, issue a short-lived
    // challenge instead of the full session. The real tokens come after the
    // TOTP code is verified.
    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaChallengeToken: signMfaChallengeToken(user._id.toString()) };
    }

    const xsrfToken = randomBytes(24).toString('hex');
    const tokens = await this.issueTokens(user, meta);

    // Alert on sign-in from a new IP (first login from this address).
    if (ip && user.lastLoginIp && user.lastLoginIp !== ip) {
      await sendSecurityAlert(
        user,
        'New sign-in detected',
        `Your account was signed into from a new IP address (${ip})${meta?.device ? ` using “${meta.device}”` : ''}.`,
      );
      await ActivityService.log({
        actorId: user._id.toString(),
        actorEmail: user.email,
        action: 'auth.login_new_ip',
        entityType: 'User',
        entityId: user._id.toString(),
        metadata: { ip },
      });
    }
    user.lastLoginIp = ip;
    user.lastLoginAt = new Date();
    await user.save();

    await ActivityService.log({
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'auth.login',
      entityType: 'User',
      entityId: user._id.toString(),
    });
    return { user: toPublicUser(user), tokens, xsrfToken };
  },

  /** Completes an MFA-protected login by verifying a TOTP code or recovery code. */
  async verifyMfaChallenge(
    mfaToken: string,
    code: string,
    meta?: SessionMeta,
  ): Promise<LoginResult> {
    let payload: { userId: string; purpose: string };
    try {
      payload = jwt.verify(mfaToken, config.accessTokenPublicKey, {
        algorithms: ['RS256'],
      }) as { userId: string; purpose: string };
    } catch {
      throw new AuthenticationError('MFA challenge expired — please log in again');
    }
    if (payload.purpose !== 'mfa' || !payload.userId) {
      throw new AuthenticationError('Invalid MFA challenge');
    }

    const user = await UserModel.findById(payload.userId).select('+mfaSecret +mfaRecoveryCodes');
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new AuthenticationError('MFA is not enabled for this account');
    }

    const codeOk = authenticator.check(code, user.mfaSecret);
    const recoveryIndex = codeOk
      ? -1
      : (user.mfaRecoveryCodes ?? []).findIndex(
          (h) => h === createHash('sha256').update(code.toUpperCase()).digest('hex'),
        );
    if (!codeOk && recoveryIndex === -1) {
      throw new AuthenticationError('Invalid two-factor code');
    }
    // A recovery code is single-use — burn it immediately.
    if (recoveryIndex !== -1 && user.mfaRecoveryCodes) {
      user.mfaRecoveryCodes.splice(recoveryIndex, 1);
      await user.save();
      await ActivityService.log({
        actorId: user._id.toString(),
        actorEmail: user.email,
        action: 'auth.mfa_recovery_used',
        entityType: 'User',
        entityId: user._id.toString(),
      });
    }

    const xsrfToken = randomBytes(24).toString('hex');
    const tokens = await this.issueTokens(user, meta);
    await ActivityService.log({
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'auth.login',
      entityType: 'User',
      entityId: user._id.toString(),
      metadata: { via: 'mfa' },
    });
    return { user: toPublicUser(user), tokens, xsrfToken };
  },

  async getUserById(userId: string): Promise<PublicUser> {
    const user = await UserModel.findById(userId);
    if (!user) throw new AuthenticationError('User not found');
    return toPublicUser(user);
  },

  async issueTokens(user: UserDocument, meta?: SessionMeta): Promise<AuthTokens> {
    const accessToken = signAccessToken(user);
    const refreshToken = generateRefreshToken();

    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      device: meta?.device ? meta.device.slice(0, 200) : undefined,
      ip: meta?.ip,
      lastUsedAt: new Date(),
    });

    return { accessToken, refreshToken };
  },

  /**
   * Validates a refresh token, rotates it, and issues a new access token.
   * Reuse detection: presenting a token that was already rotated (revoked)
   * means the httpOnly cookie was likely stolen and replayed — every session
   * of that user is revoked immediately and a security alert is raised.
   */
  async refresh(refreshToken: string): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    if (!refreshToken) throw new AuthenticationError('Missing refresh token');

    const tokenHash = hashToken(refreshToken);
    const stored = await RefreshTokenModel.findOne({ tokenHash });
    if (!stored) throw new AuthenticationError('Invalid refresh token');

    if (stored.revoked) {
      // ── Reuse detected ────────────────────────────────────────────────
      // The legitimate owner rotated this token already; whoever presents
      // it now is holding a replayed (likely stolen) token.
      logger.error('refresh token reuse detected — revoking ALL user sessions', {
        userId: stored.userId.toString(),
      });
      await RefreshTokenModel.updateMany(
        { userId: stored.userId, revoked: false },
        { $set: { revoked: true } },
      );
      const victim = await UserModel.findById(stored.userId);
      if (victim) {
        await sendSecurityAlert(
          victim,
          'Sessions revoked — token reuse detected',
          "A refresh token that was already used was presented again. As a precaution, every active session on your account has been signed out. If this wasn't you, reset your password and enable MFA.",
        );
        await ActivityService.log({
          actorId: victim._id.toString(),
          actorEmail: victim.email,
          action: 'auth.token_reuse_detected',
          entityType: 'User',
          entityId: victim._id.toString(),
        });
      }
      throw new AuthenticationError('Session revoked for security — please log in again');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      await stored.deleteOne();
      throw new AuthenticationError('Refresh token expired');
    }

    const user = await UserModel.findById(stored.userId);
    if (!user || !user.isActive) throw new AuthenticationError('User not found or inactive');

    // Rotate: revoke the presented token, issue a fresh one.
    stored.revoked = true;
    await stored.save();
    const tokens = await this.issueTokens(user, {
      device: stored.device,
      ip: stored.ip,
    });

    return { user: toPublicUser(user), tokens };
  },

  /** Invalidates the presented refresh token (logs out this session). */
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    await RefreshTokenModel.updateOne(
      { tokenHash: hashToken(refreshToken) },
      { $set: { revoked: true } },
    );
  },

  // ── Session management ──────────────────────────────────────────────────

  /** Lists the user's active sessions (excluding the current one unless asked). */
  async listSessions(userId: string, currentTokenHash?: string) {
    const docs = await RefreshTokenModel.find({ userId, revoked: false }).sort({
      createdAt: -1,
    });
    return docs.map((d) => ({
      id: d._id.toString(),
      device: d.device ?? 'Unknown device',
      ip: d.ip ?? '',
      lastUsedAt: d.lastUsedAt ?? d.createdAt,
      expiresAt: d.expiresAt,
      current: !!currentTokenHash && d.tokenHash === currentTokenHash,
    }));
  },

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await RefreshTokenModel.updateOne({ _id: sessionId, userId }, { $set: { revoked: true } });
  },

  /** Revokes every active session except the one currently presenting a token. */
  async revokeOtherSessions(userId: string, currentTokenHash?: string): Promise<void> {
    const filter: Record<string, unknown> = { userId, revoked: false };
    if (currentTokenHash) filter.tokenHash = { $ne: currentTokenHash };
    await RefreshTokenModel.updateMany(filter, { $set: { revoked: true } });
  },

  async verifyEmail(token: string): Promise<void> {
    try {
      const payload = jwt.verify(token, config.accessTokenPublicKey, {
        algorithms: ['RS256'],
      }) as { email: string };
      const user = await UserModel.findOne({ email: payload.email.toLowerCase() });
      if (!user) throw new AuthenticationError('User not found');
      user.isActive = true;
      user.emailVerified = true;
      await user.save();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AuthenticationError('Invalid or expired verification token');
    }
  },

  /** Sends a fresh verification email (never reveals whether the account exists). */
  async resendVerification(email: string): Promise<void> {
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (user && !user.emailVerified) {
      await sendMail({
        to: user.email,
        subject: 'Verify your email',
        text: `Verify your email address: ${verificationUrl(user.email)}`,
        html: `<p><a href="${verificationUrl(user.email)}">Verify your email address</a>.</p>`,
      });
    }
    // Same response either way — no account enumeration.
  },

  /** Creates a one-time, 1-hour password reset token and emails the link. */
  async forgotPassword(email: string): Promise<void> {
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Swallow to avoid account enumeration; the UI shows a generic message.
      return;
    }
    const rawToken = randomBytes(32).toString('hex');
    await PasswordResetTokenModel.create({
      userId: user._id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });
    await sendMail({
      to: user.email,
      subject: 'Reset your password',
      text: `Reset your password (valid for 1 hour): ${resetUrl(rawToken)}`,
      html: `<p>Reset your password (<strong>valid for 1 hour</strong>): <a href="${resetUrl(rawToken)}">${resetUrl(rawToken)}</a></p>`,
    });
    logger.info('password reset link sent', { userId: user._id.toString() });
  },

  /** Redeems a reset token (one-time use) and forces re-login everywhere. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const stored = await PasswordResetTokenModel.findOne({ tokenHash: hashToken(token) });
    if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new AuthenticationError('Reset link is invalid or has expired');
    }
    const user = await UserModel.findById(stored.userId);
    if (!user) throw new AuthenticationError('User not found');

    assertStrongPassword(newPassword, { username: user.username, email: user.email });
    user.password = newPassword;
    await user.save();
    stored.usedAt = new Date();
    await stored.save();
    await revokeAllRefreshTokens(user._id.toString());

    logger.info('password reset', { userId: user._id.toString() });
    await sendSecurityAlert(user, 'Password reset', 'Your password was reset.');
    await ActivityService.log({
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'auth.password_reset',
      entityType: 'User',
      entityId: user._id.toString(),
    });
  },

  /** Changes the password after verifying the current one; revokes other sessions. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await UserModel.findById(userId).select('+password');
    if (!user) throw new AuthenticationError('User not found');
    if (!(await user.comparePassword(currentPassword))) {
      throw new AuthenticationError('Current password is incorrect');
    }
    assertStrongPassword(newPassword, { username: user.username, email: user.email });
    user.password = newPassword;
    await user.save();
    await revokeAllRefreshTokens(user._id.toString());

    logger.info('password changed', { userId: user._id.toString() });
    await sendSecurityAlert(user, 'Password changed', 'Your password was changed.');
    await ActivityService.log({
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'auth.password_changed',
      entityType: 'User',
      entityId: user._id.toString(),
    });
  },

  // ── MFA (TOTP) ───────────────────────────────────────────────────────────

  /** Generates a fresh TOTP secret + otpauth URL (not saved until enabled). */
  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await UserModel.findById(userId);
    if (!user) throw new AuthenticationError('User not found');
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Alpha Platform', secret);
    return { secret, otpauthUrl };
  },

  /** Enables MFA and issues 10 single-use recovery codes (returned once). */
  async enableMfa(
    userId: string,
    secret: string,
    code: string,
  ): Promise<{ mfaEnabled: boolean; recoveryCodes: string[] }> {
    if (!authenticator.check(code, secret)) {
      throw new AuthenticationError('Invalid two-factor code');
    }
    const user = await UserModel.findById(userId);
    if (!user) throw new AuthenticationError('User not found');
    const recoveryCodes = generateRecoveryCodes();
    user.mfaSecret = secret;
    user.mfaEnabled = true;
    user.mfaRecoveryCodes = recoveryCodes.map((c) => hashToken(c));
    await user.save();
    await sendSecurityAlert(
      user,
      'Two-factor authentication enabled',
      'MFA was turned on for your account.',
    );
    await ActivityService.log({
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'auth.mfa_enabled',
      entityType: 'User',
      entityId: user._id.toString(),
    });
    return { mfaEnabled: true, recoveryCodes };
  },

  async disableMfa(userId: string, code: string): Promise<{ mfaEnabled: boolean }> {
    const user = await UserModel.findById(userId).select('+mfaSecret');
    if (!user) throw new AuthenticationError('User not found');
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new ConflictError('Two-factor authentication is not enabled');
    }
    if (!authenticator.check(code, user.mfaSecret)) {
      throw new AuthenticationError('Invalid two-factor code');
    }
    user.mfaSecret = undefined;
    user.mfaEnabled = false;
    user.mfaRecoveryCodes = undefined;
    await user.save();
    await sendSecurityAlert(
      user,
      'Two-factor authentication disabled',
      'MFA was turned off for your account.',
    );
    await ActivityService.log({
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'auth.mfa_disabled',
      entityType: 'User',
      entityId: user._id.toString(),
    });
    return { mfaEnabled: false };
  },
};

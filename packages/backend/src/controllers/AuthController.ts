import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import { ActivityService } from '../services/ActivityService.js';
import { AuthService, type LoginResult, type SessionMeta } from '../services/AuthService.js';
import { hashToken } from '../services/AuthService.js';
import { AuthenticationError } from '../utils/errors.js';

const REFRESH_COOKIE = 'refreshToken';
const XSRF_COOKIE = 'XSRF-TOKEN';

/** Captures device/IP metadata for the session registry + new-IP alerts. */
function sessionMeta(req: Request): SessionMeta {
  return {
    device: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    ip: req.ip,
  };
}

function isSecure() {
  return config.isProduction;
}

function setAuthCookies(res: Response, refreshToken: string, xsrfToken?: string): void {
  const maxAge = config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(),
    path: '/',
    maxAge,
  });
  if (xsrfToken) {
    res.cookie(XSRF_COOKIE, xsrfToken, {
      httpOnly: false, // must be readable by the SPA (axios reads it automatically)
      sameSite: 'lax',
      secure: isSecure(),
      path: '/',
      maxAge,
    });
  }
}

function sendLoginResult(res: Response, result: LoginResult): void {
  if ('mfaRequired' in result) {
    res.status(200).json({ mfaRequired: true, mfaChallengeToken: result.mfaChallengeToken });
    return;
  }
  setAuthCookies(res, result.tokens.refreshToken, result.xsrfToken);
  res.status(200).json({ user: result.user, accessToken: result.tokens.accessToken });
}

export const AuthController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await AuthService.register(req.body);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password, sessionMeta(req));
      sendLoginResult(res, result);
    } catch (err) {
      // Record the failed attempt for the security dashboard (never the password).
      if (err instanceof AuthenticationError && typeof req.body.email === 'string') {
        await ActivityService.log({
          actorEmail: req.body.email.toLowerCase(),
          action: 'auth.login_failed',
          entityType: 'User',
          metadata: { ip: req.ip, reason: err.message },
        });
      }
      next(err);
    }
  },

  /** Second step of an MFA login — verifies the TOTP code and issues tokens. */
  async mfaVerify(req: Request, res: Response, next: NextFunction) {
    try {
      const { mfaToken, code } = req.body;
      const result = await AuthService.verifyMfaChallenge(mfaToken, code, sessionMeta(req));
      sendLoginResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async sessions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const raw = req.cookies?.[REFRESH_COOKIE];
      const sessions = await AuthService.listSessions(
        req.user.id,
        typeof raw === 'string' ? hashToken(raw) : undefined,
      );
      res.status(200).json({ sessions });
    } catch (err) {
      next(err);
    }
  },

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      await AuthService.revokeSession(req.user.id, req.params.sessionId);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  async revokeAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const raw = req.cookies?.[REFRESH_COOKIE];
      await AuthService.revokeOtherSessions(
        req.user.id,
        typeof raw === 'string' ? hashToken(raw) : undefined,
      );
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE];
      if (!refreshToken) throw new AuthenticationError('Missing refresh token cookie');
      const { user, tokens } = await AuthService.refresh(refreshToken);
      setAuthCookies(res, tokens.refreshToken);
      res.status(200).json({ user, accessToken: tokens.accessToken });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE];
      await AuthService.logout(refreshToken);
      res.clearCookie(REFRESH_COOKIE, { path: '/' });
      res.clearCookie(XSRF_COOKIE, { path: '/' });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      if (!token) throw new AuthenticationError('Missing verification token');
      await AuthService.verifyEmail(token);
      res.status(200).json({ message: 'Email verified' });
    } catch (err) {
      next(err);
    }
  },

  async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      await AuthService.resendVerification(email);
      res.status(200).json({ message: 'If the email is unverified, a new link was sent.' });
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      await AuthService.forgotPassword(email);
      // Generic response — never reveal whether the account exists.
      res.status(200).json({ message: 'If that email is registered, a reset link is on its way.' });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = req.body;
      await AuthService.resetPassword(token, newPassword);
      res.status(200).json({ message: 'Password reset — you can now log in.' });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const { currentPassword, newPassword } = req.body;
      await AuthService.changePassword(req.user.id, currentPassword, newPassword);
      res.status(200).json({ message: 'Password changed — other sessions were logged out.' });
    } catch (err) {
      next(err);
    }
  },

  async mfaSetup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const result = await AuthService.setupMfa(req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async mfaEnable(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const { secret, code } = req.body;
      const result = await AuthService.enableMfa(req.user.id, secret, code);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async mfaDisable(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const { code } = req.body;
      const result = await AuthService.disableMfa(req.user.id, code);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthenticationError();
      const user = await AuthService.getUserById(req.user.id);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
};

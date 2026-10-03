import { CreateUserSchema, RegisterInputSchema } from '@alpha/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from '../controllers/AuthController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validation.js';

const router = Router();

const emailSchema = z.object({ email: z.string().email() }).strict();
const passwordSchema = z
  .string()
  .min(12, 'password must be at least 12 characters')
  .max(128, 'password must be at most 128 characters');
const totpCodeSchema = z.string().regex(/^\d{6}$/, 'code must be 6 digits');

router.post('/register', authLimiter, validate(RegisterInputSchema), AuthController.register);
router.post(
  '/login',
  authLimiter,
  validate({ body: CreateUserSchema.pick({ email: true, password: true }) }),
  AuthController.login,
);
router.post(
  '/mfa/verify',
  authLimiter,
  validate({
    body: z
      .object({
        mfaToken: z.string().min(1),
        // 6-digit TOTP code, or a 10-character single-use recovery code.
        code: z.string().regex(/^(\d{6}|[A-Z0-9]{10})$/, 'invalid code'),
      })
      .strict(),
  }),
  AuthController.mfaVerify,
);
router.post('/refresh', authLimiter, AuthController.refresh);
router.post('/logout', AuthController.logout);
router.post(
  '/verify',
  validate({ body: z.object({ token: z.string().min(1) }).strict() }),
  AuthController.verify,
);
router.post(
  '/resend-verification',
  authLimiter,
  validate({ body: emailSchema }),
  AuthController.resendVerification,
);
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: emailSchema }),
  AuthController.forgotPassword,
);
router.post(
  '/reset-password',
  authLimiter,
  validate({
    body: z.object({ token: z.string().min(1), newPassword: passwordSchema }).strict(),
  }),
  AuthController.resetPassword,
);
router.post(
  '/change-password',
  protect,
  validate({
    body: z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).strict(),
  }),
  AuthController.changePassword,
);
router.post('/mfa/setup', protect, AuthController.mfaSetup);
router.post(
  '/mfa/enable',
  protect,
  validate({
    body: z.object({ secret: z.string().min(16), code: totpCodeSchema }).strict(),
  }),
  AuthController.mfaEnable,
);
router.post(
  '/mfa/disable',
  protect,
  validate({ body: z.object({ code: totpCodeSchema }).strict() }),
  AuthController.mfaDisable,
);
router.get('/me', protect, AuthController.me);

// Session management
router.get('/sessions', protect, AuthController.sessions);
router.post('/sessions/revoke-all', protect, AuthController.revokeAll);
router.delete('/sessions/:sessionId', protect, AuthController.revokeSession);

export default router;

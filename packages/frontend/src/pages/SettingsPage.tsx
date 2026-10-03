import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, getErrorMessage } from '../lib/api';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';

const passwordSchema = z
  .string()
  .min(12, 'At least 12 characters')
  .max(128, 'At most 128 characters');

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

const mfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, '6-digit code required'),
});

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;
type MfaForm = z.infer<typeof mfaCodeSchema>;

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const changePassword = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  });
  const enableMfa = useForm<MfaForm>({ resolver: zodResolver(mfaCodeSchema) });
  const disableMfa = useForm<MfaForm>({ resolver: zodResolver(mfaCodeSchema) });
  const {
    formState: { errors: pwErrors, isSubmitting: pwSubmitting },
  } = changePassword;
  const {
    formState: { errors: enableErrors, isSubmitting: enableSubmitting },
  } = enableMfa;
  const {
    formState: { errors: disableErrors, isSubmitting: disableSubmitting },
  } = disableMfa;

  const changePw = useMutation({
    mutationFn: (values: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', values).then((r) => r.data),
    onSuccess: () => {
      toastSuccess('Password changed — other sessions were logged out.');
      changePassword.reset();
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (err) => toastError(getErrorMessage(err)),
  });

  const startSetup = async () => {
    try {
      const res = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup');
      setMfaSetup(res.data);
      const dataUrl = await QRCode.toDataURL(res.data.otpauthUrl, { margin: 1, width: 220 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  const onEnable = async (values: MfaForm) => {
    try {
      if (!mfaSetup) return;
      const res = await api.post<{ mfaEnabled: boolean; recoveryCodes: string[] }>(
        '/auth/mfa/enable',
        { secret: mfaSetup.secret, code: values.code },
      );
      toastSuccess('Two-factor authentication enabled 🎉');
      setRecoveryCodes(res.data.recoveryCodes);
      setMfaSetup(null);
      setQrDataUrl('');
      enableMfa.reset();
      setUser({ ...user, mfaEnabled: true } as never);
    } catch (err) {
      toastError(getErrorMessage(err));
      enableMfa.reset();
    }
  };

  const onDisable = async (values: MfaForm) => {
    try {
      await api.post('/auth/mfa/disable', { code: values.code });
      toastSuccess('Two-factor authentication disabled.');
      disableMfa.reset();
      setRecoveryCodes(null);
      setUser({ ...user, mfaEnabled: false } as never);
    } catch (err) {
      toastError(getErrorMessage(err));
      disableMfa.reset();
    }
  };

  const resend = useMutation({
    mutationFn: () => api.post('/auth/resend-verification', { email: user?.email }),
    onSuccess: () => toastSuccess('Verification link sent — check your email (dev: server log).'),
    onError: (err) => toastError(getErrorMessage(err)),
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.get<{ sessions: SessionInfo[] }>('/auth/sessions').then((r) => r.data),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`).then((r) => r.data),
    onSuccess: () => {
      toastSuccess('Session revoked');
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
    },
    onError: (err) => toastError(getErrorMessage(err)),
  });

  const revokeAll = useMutation({
    mutationFn: () => api.post('/auth/sessions/revoke-all').then((r) => r.data),
    onSuccess: () => {
      toastSuccess('Signed out everywhere else');
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
    },
    onError: (err) => toastError(getErrorMessage(err)),
  });

  useEffect(() => {
    if (user?.mfaEnabled === undefined) {
      api
        .get('/auth/me')
        .then((r) => setUser(r.data.user))
        .catch(() => undefined);
    }
  }, [user?.mfaEnabled, setUser]);

  if (!user) return null;

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1 className="mt-0">Account settings</h1>

      {/* ── Email verification ─────────────────────────────────────────── */}
      <Card padded className="mb-1">
        <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
          ✉️ Email verification
        </h2>
        {user?.emailVerified ? (
          <p className="muted mt-0" style={{ color: 'var(--success)' }}>
            ✅ {user.email} is verified.
          </p>
        ) : (
          <>
            <p className="muted mt-0">
              {user?.email} is not verified yet. Click the link in the email we sent, or request a
              new one.
            </p>
            <Button
              size="sm"
              variant="secondary"
              loading={resend.isPending}
              onClick={() => resend.mutate()}
            >
              Resend verification email
            </Button>
          </>
        )}
      </Card>

      {/* ── Change password ────────────────────────────────────────────── */}
      <Card padded className="mb-1">
        <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
          🔑 Change password
        </h2>
        <form
          onSubmit={changePassword.handleSubmit((v) =>
            changePw.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
          )}
        >
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={pwErrors.currentPassword?.message}
            {...changePassword.register('currentPassword')}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            error={pwErrors.newPassword?.message}
            {...changePassword.register('newPassword')}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={pwErrors.confirmPassword?.message}
            {...changePassword.register('confirmPassword')}
          />
          <Button type="submit" loading={pwSubmitting}>
            Change password
          </Button>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Changing your password logs out your other sessions.
          </p>
        </form>
      </Card>

      {/* ── Two-factor authentication ──────────────────────────────────── */}
      <Card padded className="mb-1">
        <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
          🛡️ Two-factor authentication (MFA)
        </h2>
        {recoveryCodes && (
          <div
            style={{
              border: '1px dashed var(--primary)',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
            }}
          >
            <strong>⚠️ Save these recovery codes — they are shown only once.</strong>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              If you lose your authenticator app, any one of these codes signs you in instead of a
              TOTP code. Each works a single time. Keep them somewhere safe (password manager,
              printed copy).
            </p>
            <div className="flex" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              {recoveryCodes.map((c) => (
                <code key={c} style={{ fontSize: '0.85rem' }}>
                  {c}
                </code>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryCodes.join('\n'));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied!' : 'Copy codes'}
            </Button>
          </div>
        )}
        {user?.mfaEnabled ? (
          <form onSubmit={disableMfa.handleSubmit(onDisable)}>
            <p className="muted mt-0">
              MFA is <strong>on</strong>. To turn it off, enter a current code from your
              authenticator app.
            </p>
            <Input
              label="Authenticator code"
              inputMode="numeric"
              maxLength={6}
              error={disableErrors.code?.message}
              {...disableMfa.register('code')}
            />
            <Button type="submit" variant="danger" loading={disableSubmitting}>
              Disable MFA
            </Button>
          </form>
        ) : mfaSetup ? (
          <div>
            <p className="muted mt-0">
              Scan this QR code with Google Authenticator / Authy, then enter the 6-digit code to
              enable.
            </p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="MFA QR code" style={{ borderRadius: 8 }} />
            ) : (
              <p className="muted">Generating QR…</p>
            )}
            <p className="muted" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
              Or enter this secret manually: <code>{mfaSetup.secret}</code>
            </p>
            <form onSubmit={enableMfa.handleSubmit(onEnable)}>
              <Input
                label="Authenticator code"
                inputMode="numeric"
                maxLength={6}
                error={enableErrors.code?.message}
                {...enableMfa.register('code')}
              />
              <div className="flex">
                <Button type="submit" loading={enableSubmitting}>
                  Enable MFA
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMfaSetup(null);
                    setQrDataUrl('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <p className="muted mt-0">
              Protect your account with a time-based one-time password from an authenticator app.
              When enabled, logging in also asks for a 6-digit code.
            </p>
            <Button variant="secondary" onClick={startSetup}>
              Set up MFA
            </Button>
          </>
        )}
      </Card>

      {/* ── Active sessions ────────────────────────────────────────────── */}
      <Card padded className="mb-1">
        <div className="spread">
          <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
            🖥️ Active sessions ({sessions?.sessions.length ?? 0})
          </h2>
          <Button
            size="sm"
            variant="secondary"
            loading={revokeAll.isPending}
            onClick={() => revokeAll.mutate()}
          >
            Sign out everywhere else
          </Button>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Devices with an active login. Revoking a session signs that device out immediately.
        </p>
        {sessionsLoading && <p className="muted">Loading…</p>}
        {sessions?.sessions.map((s) => (
          <div
            key={s.id}
            className="spread"
            style={{ borderBottom: '1px solid var(--border)', padding: '0.5rem 0' }}
          >
            <div>
              <strong style={{ fontSize: '0.92rem' }}>
                {s.device || 'Unknown device'}
                {s.current ? ' · this device' : ''}
              </strong>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {s.ip} · last used {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : '—'} ·
                expires {new Date(s.expiresAt).toLocaleDateString()}
              </div>
            </div>
            {!s.current && (
              <Button
                variant="danger"
                size="sm"
                loading={revokeOne.isPending}
                onClick={() => revokeOne.mutate(s.id)}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
        {!sessionsLoading && sessions?.sessions.length === 0 && (
          <p className="muted">No active sessions.</p>
        )}
      </Card>
    </div>
  );
}

interface SessionInfo {
  id: string;
  device?: string;
  ip?: string;
  lastUsedAt?: string;
  expiresAt: string;
  current: boolean;
}

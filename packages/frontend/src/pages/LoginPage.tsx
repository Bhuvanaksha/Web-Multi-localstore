import type { User } from '@alpha/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api, getErrorMessage } from '../lib/api';
import { homeForRole } from '../lib/roles';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const mfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
});

type LoginForm = z.infer<typeof loginSchema>;
type MfaForm = z.infer<typeof mfaSchema>;

export function LoginPage({ provider = false }: { provider?: boolean }) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState('');

  const login = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const mfa = useForm<MfaForm>({ resolver: zodResolver(mfaSchema) });
  const {
    formState: { errors: loginErrors, isSubmitting: loginSubmitting },
  } = login;
  const {
    formState: { errors: mfaErrors, isSubmitting: mfaSubmitting },
  } = mfa;

  const onLogin = async (values: LoginForm) => {
    try {
      const res = await api.post<{
        mfaRequired?: boolean;
        mfaChallengeToken?: string;
        user?: User;
        accessToken?: string;
      }>('/auth/login', values);
      if (res.data.mfaRequired && res.data.mfaChallengeToken) {
        setMfaToken(res.data.mfaChallengeToken);
        setMfaRequired(true);
        return;
      }
      if (!res.data.user || !res.data.accessToken) throw new Error('Unexpected login response');
      setSession(res.data.user, res.data.accessToken);
      toastSuccess(`Welcome back, ${res.data.user.username}!`);
      // Land on the page that matches the account's role (not the login page).
      navigate(homeForRole(res.data.user.role));
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  const onMfa = async (values: MfaForm) => {
    try {
      const res = await api.post<{
        user?: User;
        accessToken?: string;
      }>('/auth/mfa/verify', { mfaToken, code: values.code });
      if (!res.data.user || !res.data.accessToken) throw new Error('Unexpected MFA response');
      setSession(res.data.user, res.data.accessToken);
      toastSuccess(`Welcome back, ${res.data.user.username}!`);
      navigate(homeForRole(res.data.user.role));
    } catch (err) {
      toastError(getErrorMessage(err));
      mfa.reset();
    }
  };

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <Card padded>
        <h1 className="mt-0">
          {mfaRequired
            ? 'Two-factor authentication'
            : provider
              ? 'Provider log in'
              : 'Customer log in'}
        </h1>
        {provider && !mfaRequired && (
          <p className="muted mb-1" style={{ marginTop: 0 }}>
            🛍️ Sell your services, groceries and items from Provider Studio.
          </p>
        )}
        {mfaRequired ? (
          <>
            <p className="muted mb-1">
              Enter the 6-digit code from your authenticator app (Google Authenticator, Authy…).
            </p>
            <form onSubmit={mfa.handleSubmit(onMfa)}>
              <Input
                label="Authenticator code"
                inputMode="numeric"
                maxLength={6}
                error={mfaErrors.code?.message}
                autoFocus
                {...mfa.register('code')}
              />
              <Button type="submit" fullWidth loading={mfaSubmitting}>
                Verify &amp; log in
              </Button>
            </form>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMfaRequired(false);
                mfa.reset();
              }}
            >
              ← Back to password
            </button>
          </>
        ) : (
          <form onSubmit={login.handleSubmit(onLogin)}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              error={loginErrors.email?.message}
              {...login.register('email')}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              error={loginErrors.password?.message}
              {...login.register('password')}
            />
            <Button type="submit" fullWidth loading={loginSubmitting}>
              Log in
            </Button>
            <p className="muted mb-1" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
              <Link to="/forgot-password">Forgot password?</Link>
            </p>
          </form>
        )}
        {!mfaRequired && (
          <p className="muted mb-1">
            {provider ? (
              <>
                Not a provider? <Link to="/login">Customer log in</Link> ·{' '}
                <Link to="/register/provider">Register as provider</Link>
              </>
            ) : (
              <>
                No account? <Link to="/register">Sign up</Link> ·{' '}
                <Link to="/login/provider">Log in as provider</Link>
              </>
            )}
          </p>
        )}
      </Card>
    </div>
  );
}

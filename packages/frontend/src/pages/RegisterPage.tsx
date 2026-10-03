import { zodResolver } from '@hookform/resolvers/zod';
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

// Mirrors the backend CreateUserSchema (profile is optional).
const baseSchema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(20, 'At most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscore only'),
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword: z.string(),
  shopName: z.string().max(60).optional(),
});

const registerSchema = baseSchema.refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage({ provider = false }: { provider?: boolean }) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async ({ username, email, password, shopName }: RegisterForm) => {
    try {
      await api.post('/auth/register', {
        username,
        email,
        password,
        // Providers can store their business name; customers leave it blank.
        profile: shopName?.trim() ? { firstName: shopName.trim() } : undefined,
      });
      // Auto-login right after registering.
      const res = await api.post('/auth/login', { email, password });
      setSession(res.data.user, res.data.accessToken);
      toastSuccess('Account created — welcome!');
      navigate(homeForRole(res.data.user.role));
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <Card padded>
        <h1 className="mt-0">{provider ? 'Register as provider' : 'Create an account'}</h1>
        <p className="muted mb-1" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Your role is picked automatically from your email: <code>.local</code> → admin · contains{' '}
          <code>store</code> or <code>groceries</code> → provider · anything else → customer.
        </p>
        {provider && (
          <p className="muted mb-1" style={{ marginTop: 0 }}>
            🛍️ Start listing your services, groceries and items within minutes — sign up with a{' '}
            <code>store</code>/<code>groceries</code> email (e.g. my.store@gmail.com).
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)}>
          <Input
            label="Username"
            error={errors.username?.message}
            autoComplete="username"
            {...register('username')}
          />
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            autoComplete="email"
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            error={errors.password?.message}
            autoComplete="new-password"
            {...register('password')}
          />
          <Input
            label="Confirm password"
            type="password"
            error={errors.confirmPassword?.message}
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
          {provider && (
            <Input
              label="Business / shop name (optional)"
              error={errors.shopName?.message}
              placeholder="e.g. Sharma Kirana Store"
              {...register('shopName')}
            />
          )}
          <Button type="submit" fullWidth loading={isSubmitting}>
            {provider ? 'Create provider account' : 'Sign up'}
          </Button>
        </form>
        <p className="muted mb-1">
          {provider ? (
            <>
              Already a provider? <Link to="/login/provider">Log in</Link> ·{' '}
              <Link to="/register">Customer sign up</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Log in</Link> ·{' '}
              <Link to="/register/provider">Register as provider</Link>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, getErrorMessage } from '../lib/api';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import { toastError } from '../shared/ui/Toast';

const schema = z
  .object({
    newPassword: z.string().min(12, 'At least 12 characters').max(128, 'At most 128 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type Form = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Form) => {
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.newPassword });
      setDone(true);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <Card padded>
        <h1 className="mt-0">Reset password</h1>
        {!token ? (
          <p className="muted mt-0">This link is missing its token. Request a new reset link.</p>
        ) : done ? (
          <>
            <p className="muted mt-0" style={{ color: 'var(--success)' }}>
              ✅ Password reset. You can now log in with your new password.
            </p>
            <p className="muted mb-1">
              <Link to="/login">Go to login</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <Button type="submit" fullWidth loading={isSubmitting}>
              Set new password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

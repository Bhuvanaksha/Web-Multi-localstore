import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { api, getErrorMessage } from '../lib/api';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import { toastError } from '../shared/ui/Toast';

const schema = z.object({ email: z.string().email() });
type Form = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Form) => {
    try {
      await api.post('/auth/forgot-password', values);
      setSent(true);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <Card padded>
        <h1 className="mt-0">Forgot password</h1>
        {sent ? (
          <>
            <p className="muted mt-0">
              If that email is registered, a password-reset link (valid for 1 hour) is on its way.
              In development without SMTP it appears in the server log.
            </p>
            <p className="muted mb-1">
              <Link to="/login">Back to login</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" fullWidth loading={isSubmitting}>
              Send reset link
            </Button>
            <p className="muted mb-1">
              <Link to="/login">Back to login</Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}

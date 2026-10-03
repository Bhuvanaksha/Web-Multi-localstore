import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { Card } from '../shared/ui/Card';
import { Spinner } from '../shared/ui/Spinner';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Missing verification token');
      return;
    }
    api
      .post('/auth/verify', { token })
      .then(() => {
        setState('success');
        setMessage('Your email is verified. You can now log in.');
      })
      .catch((err) => {
        setState('error');
        setMessage(getErrorMessage(err));
      });
  }, [token]);

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <Card padded>
        <h1 className="mt-0">Email verification</h1>
        {state === 'loading' && (
          <p className="flex">
            <Spinner /> Verifying…
          </p>
        )}
        {state === 'success' && <p style={{ color: 'var(--success)' }}>{message}</p>}
        {state === 'error' && <p style={{ color: 'var(--danger)' }}>{message}</p>}
        <p className="muted mb-1">
          <Link to="/login">Go to login</Link>
        </p>
      </Card>
    </div>
  );
}

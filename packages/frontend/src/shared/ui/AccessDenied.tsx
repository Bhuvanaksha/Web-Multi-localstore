import { Link } from 'react-router-dom';
import { Button } from './Button';
import { Card } from './Card';

export interface AccessDeniedProps {
  title: string;
  message: string;
  to?: string;
  action?: string;
}

export function AccessDenied({
  title,
  message,
  to = '/dashboard',
  action = 'Go to my dashboard',
}: AccessDeniedProps) {
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <Card padded>
        <h1 className="mt-0">🚫 {title}</h1>
        <p className="muted">{message}</p>
        <Link to={to}>
          <Button>{action}</Button>
        </Link>
      </Card>
    </div>
  );
}

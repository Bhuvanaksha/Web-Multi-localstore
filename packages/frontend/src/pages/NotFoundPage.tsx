import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <h1>404</h1>
      <p className="muted">This page does not exist.</p>
      <Link to="/">← Back to home</Link>
    </div>
  );
}

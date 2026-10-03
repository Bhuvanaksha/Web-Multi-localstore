import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocketEvent } from '../context/SocketContext';
import { useMarkNotificationRead, useNotifications } from '../hooks/useNotifications';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useNotifications(true);
  const markRead = useMarkNotificationRead();
  useSocketEvent('notification:push', () => undefined); // cache updated in SocketProvider

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = data?.unread ?? 0;

  return (
    <div className="flex" style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ position: 'relative' }}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unread} unread)`}
        title="Notifications"
      >
        🔔{unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div
            className="spread"
            style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}
          >
            <strong>Notifications</strong>
            {unread > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (!data) return;
                  for (const n of data.items) {
                    if (!n.read) markRead.mutate(n.id);
                  }
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          {isLoading && (
            <p className="muted" style={{ padding: '1rem' }}>
              Loading…
            </p>
          )}
          {!isLoading && (!data || data.items.length === 0) && (
            <p className="muted" style={{ padding: '1rem' }}>
              No notifications
            </p>
          )}
          {data?.items.slice(0, 20).map((n) => (
            <div
              key={n.id}
              style={{
                padding: '0.6rem 1rem',
                borderBottom: '1px solid var(--border)',
                background: n.read
                  ? 'transparent'
                  : 'color-mix(in srgb, var(--primary) 8%, transparent)',
              }}
            >
              {n.resourceId ? (
                <Link to={`/resources/${n.resourceId}`} onClick={() => setOpen(false)}>
                  {n.message}
                </Link>
              ) : (
                <span>{n.message}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { Paginated, ResourceListItem } from '../hooks/useResources';
import { api, getErrorMessage } from '../lib/api';
import { formatPrice } from '../lib/utils';
import { Button } from '../shared/ui/Button';
import { Skeleton } from '../shared/ui/Skeleton';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';

interface OrderRow {
  id: string;
  customer: { name: string; email: string };
  items: Array<{ title: string; quantity: number; unit?: string }>;
  totalPrice: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  paymentStatus: string;
  createdAt?: string;
  delivery?: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  };
}

interface ActivityRow {
  id: string;
  actorEmail?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

const STATUSES = ['', 'pending_review', 'reviewing', 'approved', 'changes_requested', 'rejected'];
const TABS = ['moderation', 'orders', 'activity', 'security'] as const;
type Tab = (typeof TABS)[number];

interface SecurityOverview {
  totals: {
    users: number;
    mfaEnabled: number;
    emailVerified: number;
    lockedAccounts: number;
    activeSessions: number;
  };
  recent: { failedLogins24h: number; newIpLogins24h: number };
  loginTrend: Array<{ date: string; success: number; failed: number }>;
  topFailedAccounts: Array<{ email: string; failedLoginAttempts: number; locked: boolean }>;
  recentSecurityEvents: Array<{
    id: string;
    actorEmail: string;
    action: string;
    metadata: Record<string, unknown>;
    createdAt?: string;
  }>;
  health: { uptimeSeconds: number; memoryMb: number; mongoConnected: boolean };
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': '✅ Login',
  'auth.login_failed': '🚫 Failed login',
  'auth.login_new_ip': '🌍 New-IP login',
  'auth.registered': '📝 Registration',
  'auth.password_reset': '🔑 Password reset',
  'auth.password_changed': '🔒 Password changed',
  'auth.mfa_enabled': '🛡️ MFA enabled',
  'auth.mfa_disabled': '🛡️ MFA disabled',
  'auth.mfa_recovery_used': '🔑 Recovery code used',
};

export function AdminPanelPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('moderation');
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actionFilter, setActionFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-resources', status],
    queryFn: () =>
      api
        .get<Paginated<ResourceListItem>>('/resources/admin/all', {
          params: { status: status || undefined, page: 1, limit: 50 },
        })
        .then((r) => r.data),
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () =>
      api.get<{ items: OrderRow[]; total: number }>('/admin/orders').then((r) => r.data),
    enabled: tab === 'orders',
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['admin-activity', actionFilter],
    queryFn: () =>
      api
        .get<{ items: ActivityRow[]; total: number }>('/admin/activity', {
          params: { action: actionFilter || undefined, limit: 50 },
        })
        .then((r) => r.data),
    enabled: tab === 'activity',
  });

  const { data: security, isLoading: securityLoading } = useQuery({
    queryKey: ['admin-security'],
    queryFn: () => api.get<SecurityOverview>('/admin/security/overview').then((r) => r.data),
    enabled: tab === 'security',
    refetchInterval: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-resources'] });

  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'approve' | 'reject' | 'request-changes' }) =>
      api
        .post(`/resources/${id}/${kind}`, { reason: notes[id], notes: notes[id] })
        .then((r) => r.data),
    onSuccess: () => {
      toastSuccess('Action applied');
      invalidate();
    },
    onError: (err) => toastError(getErrorMessage(err)),
  });

  const exportOrders = async () => {
    try {
      const res = await api.get('/admin/orders/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess('Orders report downloaded');
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  const downloadBlob = async (path: string, filename: string) => {
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess(`${filename} downloaded`);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') {
    return (
      <div className="page">
        <h1>Admin panel</h1>
        <p className="muted">This area is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="page">
      {' '}
      <div className="spread mb-2">
        <h1 className="mt-0">Admin panel</h1>
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)}
            >
              {t === 'moderation'
                ? '🗂 Moderation'
                : t === 'orders'
                  ? '📦 Orders'
                  : t === 'activity'
                    ? '📜 Activity logs'
                    : '🛡️ Security & Monitoring'}
            </button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadBlob(
                '/admin/report/download',
                `full-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
              )
            }
          >
            📊 Full report (.xlsx)
          </Button>
        </div>
      </div>
      {tab === 'moderation' && (
        <>
          <div className="spread mb-2">
            <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
              Moderation queue
            </h2>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === '' ? 'All statuses' : s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <Skeleton height="8rem" />
          ) : !data || data.items.length === 0 ? (
            <p className="muted">Nothing here.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <a href={`/resources/${r.slug ?? r.id}`} target="_blank" rel="noreferrer">
                        {r.title}
                      </a>
                    </td>
                    <td className="muted">user_{r.authorId?.slice(-4)}</td>
                    <td>
                      <span className={`badge badge-${r.status}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {['pending_review', 'reviewing'].includes(r.status) && (
                        <div className="flex">
                          <Button
                            size="sm"
                            loading={action.isPending}
                            onClick={() => action.mutate({ id: r.id, kind: 'approve' })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            loading={action.isPending}
                            onClick={() => action.mutate({ id: r.id, kind: 'reject' })}
                          >
                            Reject
                          </Button>
                          <input
                            aria-label={`Notes for ${r.title}`}
                            placeholder="Notes…"
                            value={notes[r.id] ?? ''}
                            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            style={{ width: 110 }}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={action.isPending}
                            onClick={() => action.mutate({ id: r.id, kind: 'request-changes' })}
                          >
                            Request changes
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {tab === 'orders' && (
        <>
          <div className="spread mb-2">
            <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
              All orders ({orders?.total ?? 0})
            </h2>
            <Button variant="secondary" size="sm" onClick={exportOrders}>
              📄 Export to Excel
            </Button>
          </div>
          {ordersLoading ? (
            <Skeleton height="8rem" />
          ) : !orders || orders.items.length === 0 ? (
            <p className="muted">No orders yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Delivery</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.items.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id.slice(-6).toUpperCase()}</td>
                    <td>
                      {o.customer.name}
                      <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                        {o.customer.email}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {o.items.map((i) => `${i.title} ×${i.quantity}`).join(', ')}
                    </td>
                    <td>{formatPrice(o.totalPrice, o.currency)}</td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {o.delivery ? (
                        <>
                          {o.delivery.fullName}, {o.delivery.addressLine1}
                          {o.delivery.city ? `, ${o.delivery.city}` : ''} {o.delivery.pincode}
                          <span style={{ display: 'block' }}>📞 {o.delivery.phone}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className="chip">{o.status}</span>
                    </td>
                    <td>
                      <span className="chip">
                        {o.paymentMethod?.toUpperCase() ?? '—'} · {o.paymentStatus}
                      </span>
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {tab === 'security' && (
        <SecurityOverviewView loading={securityLoading} data={security} onExport={downloadBlob} />
      )}
      {tab === 'activity' && (
        <>
          <div className="spread mb-2">
            <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
              Activity logs ({activity?.total ?? 0})
            </h2>
            <div className="flex">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  downloadBlob(
                    '/admin/activity/export',
                    `activity-logs-${new Date().toISOString().slice(0, 10)}.xlsx`,
                  )
                }
              >
                📄 Export logs
              </Button>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label="Filter by action"
              >
                <option value="">All actions</option>
                <option value="auth.login">auth.login</option>
                <option value="auth.registered">auth.registered</option>
                <option value="order.placed">order.placed</option>
                <option value="order.confirmed">order.confirmed</option>
                <option value="order.cancelled">order.cancelled</option>
                <option value="order.paid">order.paid</option>
                <option value="listing.created">listing.created</option>
                <option value="listing.deleted">listing.deleted</option>
              </select>
            </div>
          </div>
          {activityLoading ? (
            <Skeleton height="8rem" />
          ) : !activity || activity.items.length === 0 ? (
            <p className="muted">No activity recorded yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activity.items.map((a) => (
                  <tr key={a.id}>
                    <td className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                    </td>
                    <td>{a.actorEmail ?? (a.metadata?.username as string) ?? '—'}</td>
                    <td>
                      <span className="chip">{a.action}</span>
                    </td>
                    <td className="muted" style={{ fontSize: '0.85rem' }}>
                      {a.entityType ? `${a.entityType} ${a.entityId?.slice(-6) ?? ''}` : '—'}
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {a.metadata ? JSON.stringify(a.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function SecurityOverviewView({
  loading,
  data,
  onExport,
}: {
  loading: boolean;
  data?: SecurityOverview;
  onExport: (path: string, filename: string) => void;
}) {
  if (loading || !data) return <Skeleton height="12rem" />;
  const t = data.totals;
  const r = data.recent;
  const lastLogin = data.loginTrend.length > 0 ? data.loginTrend[data.loginTrend.length - 1] : null;
  return (
    <div className="stack">
      <div className="spread mb-1">
        <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
          🛡️ Security & Monitoring
        </h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onExport(
              '/admin/security/export',
              `security-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
            )
          }
        >
          📄 Export security report
        </Button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{t.users}</div>
          <div className="stat-label">Total users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{t.mfaEnabled}</div>
          <div className="stat-label">MFA enabled</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{t.emailVerified}</div>
          <div className="stat-label">Emails verified</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: t.lockedAccounts > 0 ? '#e74c3c' : undefined }}
          >
            {t.lockedAccounts}
          </div>
          <div className="stat-label">Locked accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{t.activeSessions}</div>
          <div className="stat-label">Active sessions</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: r.failedLogins24h > 10 ? '#e74c3c' : undefined }}
          >
            {r.failedLogins24h}
          </div>
          <div className="stat-label">Failed logins (24h)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{r.newIpLogins24h}</div>
          <div className="stat-label">New-IP logins (24h)</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: !data.health.mongoConnected ? '#e74c3c' : undefined }}
          >
            {data.health.mongoConnected ? 'OK' : 'DOWN'}
          </div>
          <div className="stat-label">MongoDB</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="mt-0" style={{ fontSize: '0.95rem' }}>
            Login trend (last 7 days)
          </h3>
          <div className="login-bars">
            {data.loginTrend.map((d) => (
              <div
                key={d.date}
                className="login-bar-col"
                title={`${d.date}: ${d.success} ok / ${d.failed} failed`}
              >
                <div
                  className="login-bar"
                  style={{
                    height: `${Math.max(4, (d.success / (lastLogin?.success ?? 1)) * 100)}%`,
                  }}
                >
                  <span className="login-bar-label" style={{ color: '#2ecc71' }}>
                    {d.success}
                  </span>
                </div>
                <div
                  className="login-bar"
                  style={{
                    height: `${Math.max(4, (d.failed / Math.max(lastLogin?.failed ?? 1, 1)) * 100)}%`,
                    background: '#e74c3c',
                  }}
                >
                  <span className="login-bar-label" style={{ color: '#e74c3c' }}>
                    {d.failed}
                  </span>
                </div>
                <div className="login-bar-date">{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="mt-0" style={{ fontSize: '0.95rem' }}>
            Top failed-login accounts
          </h3>
          {data.topFailedAccounts.length === 0 ? (
            <p className="muted">No failed logins recorded.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Failed attempts</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.topFailedAccounts.map((u) => (
                  <tr key={u.email}>
                    <td className="muted">{u.email}</td>
                    <td>{u.failedLoginAttempts}</td>
                    <td>
                      <span className={u.locked ? 'badge badge-rejected' : 'chip'}>
                        {u.locked ? 'LOCKED' : 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="mt-0" style={{ fontSize: '0.95rem' }}>
          Recent security events
        </h3>
        {data.recentSecurityEvents.length === 0 ? (
          <p className="muted">No security events yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSecurityEvents.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}
                  </td>
                  <td className="muted">{e.actorEmail}</td>
                  <td>
                    <span className="chip">{ACTION_LABELS[e.action] ?? e.action}</span>
                  </td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>
                    {e.metadata ? JSON.stringify(e.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 className="mt-0" style={{ fontSize: '0.95rem' }}>
          System health
        </h3>
        <div
          className="stats-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
        >
          <div className="stat-card">
            <div className="stat-value">
              {Math.floor(data.health.uptimeSeconds / 3600)}h{' '}
              {Math.floor((data.health.uptimeSeconds % 3600) / 60)}m
            </div>
            <div className="stat-label">Uptime</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{data.health.memoryMb.toFixed(0)} MB</div>
            <div className="stat-label">Memory (RSS)</div>
          </div>
          <div className="stat-card">
            <div
              className="stat-value"
              style={{ color: data.health.mongoConnected ? '#2ecc71' : '#e74c3c' }}
            >
              {data.health.mongoConnected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="stat-label">MongoDB status</div>
          </div>
        </div>
      </div>
    </div>
  );
}

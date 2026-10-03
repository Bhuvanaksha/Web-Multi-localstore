import type { Order } from '@alpha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { Paginated, ResourceListItem } from '../hooks/useResources';
import { api, getErrorMessage } from '../lib/api';
import { formatPrice } from '../lib/utils';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Skeleton } from '../shared/ui/Skeleton';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';

function CustomerDashboard() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.get<{ items: Order[] }>('/orders/mine').then((r) => r.data),
    enabled: !!user,
  });

  const recent = data?.items.slice(0, 5) ?? [];

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <h1 className="mt-0">👋 Welcome, {user?.username}!</h1>
      <p className="muted mb-2">
        Browse the marketplace and order groceries &amp; items from local providers.
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Card padded>
          <strong>🛍️ Marketplace</strong>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Groceries, services and items from local providers.
          </p>
          <Link to="/marketplace">
            <Button size="sm">Start shopping</Button>
          </Link>
        </Card>
        <Card padded>
          <strong>📦 Your orders</strong>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Track delivery, cancel pending orders, pay online.
          </p>
          <Link to="/orders">
            <Button size="sm" variant="secondary">
              View orders
            </Button>
          </Link>
        </Card>
      </div>

      <h2 className="mb-1" style={{ fontSize: '1.05rem', marginTop: '2rem' }}>
        Recent orders
      </h2>
      {isLoading && <Skeleton height="4rem" />}
      {!isLoading && recent.length === 0 && (
        <Card padded>
          <p className="muted mt-0">
            No orders yet — your cart and order history will show up here.
          </p>
        </Card>
      )}
      {recent.map((order) => (
        <Card key={order.id} padded className="mb-1">
          <div className="spread">
            <div className="flex">
              <strong>#{order.id?.slice(-6).toUpperCase()}</strong>
              <span className="chip">{order.status}</span>
              <span className="chip">
                {order.paymentMethod?.toUpperCase() ?? '—'} · {order.paymentStatus}
              </span>
            </div>
            <div className="flex">
              <strong>{formatPrice(order.totalPrice, order.currency)}</strong>
              <Link to="/orders">
                <Button variant="ghost" size="sm">
                  Details
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['my-resources', page],
    queryFn: () =>
      api
        .get<Paginated<ResourceListItem>>('/resources/mine', { params: { page, limit: 10 } })
        .then((r) => r.data),
  });

  const submit = useMutation({
    mutationFn: (id: string) => api.post(`/resources/${id}/submit`).then((r) => r.data),
    onSuccess: () => {
      toastSuccess('Submitted for review');
      queryClient.invalidateQueries({ queryKey: ['my-resources'] });
    },
    onError: (err) => toastError(getErrorMessage(err)),
  });

  if (!user) return null;

  return (
    <div className="page">
      <div className="spread mb-2">
        <h1 className="mt-0">My resources</h1>
        <Link to="/submit">
          <Button size="sm">New resource</Button>
        </Link>
      </div>

      {isLoading ? (
        <Skeleton height="6rem" />
      ) : !data || data.items.length === 0 ? (
        <p className="muted">You haven't created anything yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Views</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/resources/${r.slug ?? r.id}`}>{r.title}</Link>
                </td>
                <td>
                  <span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span>
                </td>
                <td>{r.viewCount}</td>
                <td>
                  {r.status === 'draft' && (
                    <Button
                      size="sm"
                      loading={submit.isPending}
                      onClick={() => submit.mutate(r.id)}
                    >
                      Submit for review
                    </Button>
                  )}
                  {r.status === 'changes_requested' && (
                    <Link to={`/submit?edit=${r.id}`}>
                      <Button size="sm" variant="secondary">
                        Edit
                      </Button>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex mb-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </Button>
          <span className="muted">
            Page {data.page} / {data.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  // Providers have their own studio — the marketplace dashboard is for buyers.
  if (user.role === 'provider') return <Navigate to="/provider" replace />;
  if (user.role === 'customer') return <CustomerDashboard />;
  return <MemberDashboard />;
}

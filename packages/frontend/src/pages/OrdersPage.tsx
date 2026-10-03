import type { Order } from '@alpha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { canBuy } from '../lib/roles';
import { formatPrice } from '../lib/utils';
import { AccessDenied } from '../shared/ui/AccessDenied';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';

const STATUS_COLORS: Record<string, string> = {
  pending: '#fef3c7',
  confirmed: '#dcfce7',
  shipped: '#dbeafe',
  delivered: '#bbf7d0',
  cancelled: '#fee2e2',
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

const TRACK_STEPS = ['pending', 'confirmed', 'shipped', 'delivered'] as const;
const STEP_LABELS: Record<string, string> = {
  pending: 'Placed',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

function TrackTimeline({ order }: { order: Order }) {
  const currentIndex = TRACK_STEPS.indexOf(order.status as (typeof TRACK_STEPS)[number]);
  const history = order.statusHistory ?? [];
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        margin: '0.5rem 0 0.75rem',
        alignItems: 'center',
      }}
    >
      {TRACK_STEPS.map((step, i) => {
        const entry = history.find((h) => h.status === step);
        const done = currentIndex >= i && order.status !== 'cancelled';
        const current = currentIndex === i && order.status !== 'cancelled';
        const node: ReactNode = (
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                margin: '0 auto 0.25rem',
                background: done ? 'var(--primary)' : 'var(--border)',
                boxShadow: current
                  ? '0 0 0 4px color-mix(in srgb, var(--primary) 25%, transparent)'
                  : undefined,
              }}
            />
            <div
              className={done ? undefined : 'muted'}
              style={{ fontSize: '0.72rem', fontWeight: done ? 600 : 400 }}
            >
              {STEP_LABELS[step]}
            </div>
            {entry?.at && (
              <div className="muted" style={{ fontSize: '0.65rem' }}>
                {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        );
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            {node}
            {i < TRACK_STEPS.length - 1 && (
              <div
                style={{
                  height: 2,
                  flex: 1,
                  marginBottom: '1.4rem',
                  background: currentIndex > i ? 'var(--primary)' : 'var(--border)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function orderTotalForProvider(order: Order, providerId?: string): number {
  if (!providerId) return order.totalPrice;
  const mine = order.items.filter((i) => i.providerId === providerId);
  return mine.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

export function OrdersPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.get<{ items: Order[] }>('/orders/mine').then((r) => r.data),
    enabled: !!user,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/orders/${id}/status`, { status: 'cancelled' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-orders'] }),
  });

  const pay = useMutation({
    mutationFn: (id: string) => api.post(`/orders/${id}/pay`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-orders'] }),
  });

  const payNow = async (order: Order) => {
    if (!order.id) return;
    try {
      const intent = await api
        .post<{
          gateway: 'demo' | 'razorpay';
          orderId?: string;
          keyId?: string;
          amount?: number;
          currency?: string;
        }>(`/orders/${order.id}/payment-intent`)
        .then((r) => r.data);

      if (intent.gateway === 'demo') {
        await pay.mutateAsync(order.id);
        toastSuccess('Payment recorded (demo gateway)');
        return;
      }

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Razorpay unavailable');
      const rp = new window.Razorpay({
        key: intent.keyId,
        amount: intent.amount,
        currency: intent.currency,
        order_id: intent.orderId,
        name: 'Alpha Marketplace',
        description: `Order #${order.id.slice(-6).toUpperCase()}`,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await api.post(`/orders/${order.id}/payment-verify`, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            toastSuccess('Payment successful 🎉');
            queryClient.invalidateQueries({ queryKey: ['my-orders'] });
          } catch (err) {
            toastError(getErrorMessage(err));
          }
        },
        theme: { color: '#0e7490' },
      });
      rp.open();
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!canBuy(user.role)) {
    return (
      <AccessDenied
        title="Sellers can't shop"
        message="Provider accounts sell services, groceries and items — they don't place orders. Switch to a customer account to buy."
        to="/provider"
        action="Open Provider Studio"
      />
    );
  }

  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toastSuccess('Order cancelled — stock restored');
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <h1 className="mt-0">📦 My orders</h1>
      {isLoading && <p className="muted">Loading orders…</p>}
      {!isLoading && (!data || data.items.length === 0) && (
        <Card padded>
          <p className="muted mt-0">No orders yet — pick something from the marketplace!</p>
        </Card>
      )}
      {data?.items.map((order) => (
        <Card key={order.id} padded className="mb-1">
          <div className="spread mb-1">
            <div className="flex">
              <strong>#{order.id?.slice(-6).toUpperCase()}</strong>
              <span
                className="badge"
                style={{ background: STATUS_COLORS[order.status] ?? '#e2e8f0' }}
              >
                {order.status}
              </span>
              <span className="chip">
                {order.paymentMethod?.toUpperCase() ?? '—'} · {order.paymentStatus}
              </span>
            </div>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {order.items.map((item) => (
              <li key={item.listingId} style={{ fontSize: '0.92rem' }}>
                {item.title} × {item.quantity}
                {item.unit ? ` (${item.unit})` : ''} —{' '}
                {formatPrice(item.unitPrice * item.quantity, order.currency)}
              </li>
            ))}
          </ul>
          {order.delivery && (
            <div
              className="muted"
              style={{
                fontSize: '0.85rem',
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
              }}
            >
              📍 Deliver to <strong>{order.delivery.fullName}</strong> —{' '}
              {order.delivery.addressLine1}
              {order.delivery.addressLine2 ? `, ${order.delivery.addressLine2}` : ''}
              {order.delivery.landmark ? ` (${order.delivery.landmark})` : ''},{' '}
              {order.delivery.city}, {order.delivery.state} {order.delivery.pincode} · 📞{' '}
              {order.delivery.phone}
            </div>
          )}
          <TrackTimeline order={order} />
          <div className="spread">
            <strong>Total: {formatPrice(order.totalPrice, order.currency)}</strong>
            <div className="flex">
              {order.paymentStatus === 'unpaid' && order.paymentMethod !== 'cod' && order.id && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pay.isPending}
                  onClick={() => payNow(order)}
                >
                  💳 Pay now
                </Button>
              )}
              {order.paymentStatus === 'unpaid' && order.paymentMethod === 'cod' && (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  Pay on delivery
                </span>
              )}
              {order.status === 'pending' && (
                <Button
                  variant="danger"
                  size="sm"
                  loading={cancel.isPending}
                  onClick={() => order.id && handleCancel(order.id)}
                >
                  Cancel order
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Re-export helper so the provider inbox can reuse it.
export { orderTotalForProvider };

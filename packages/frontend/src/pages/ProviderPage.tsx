import {
  type Order,
  type ProviderListing,
  ProviderListingCategoryEnum,
  ProviderListingUnitEnum,
} from '@alpha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { canSell } from '../lib/roles';
import { formatPrice } from '../lib/utils';
import { AccessDenied } from '../shared/ui/AccessDenied';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';
import { orderTotalForProvider } from './OrdersPage';

const CATEGORY_LABELS: Record<string, string> = {
  service: 'Service',
  grocery: 'Grocery',
  item: 'Item / Product',
  other: 'Other',
};

const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  l: 'L',
  units: 'units',
  pcs: 'pcs',
  other: 'other',
};

interface ListingFormState {
  title: string;
  description: string;
  category: string;
  price: string;
  unit: string;
  quantity: string;
  contactPhone: string;
  contactEmail: string;
}

const EMPTY_FORM: ListingFormState = {
  title: '',
  description: '',
  category: 'service',
  price: '',
  unit: '',
  quantity: '',
  contactPhone: '',
  contactEmail: '',
};

export function ProviderPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ListingFormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['provider-listings'],
    queryFn: () =>
      api
        .get<{ items: ProviderListing[]; total: number }>('/provider/listings/mine')
        .then((r) => r.data),
    enabled: !!user,
  });

  const createListing = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.post('/provider/listings', input).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-listings'] });
    },
  });

  const deleteListing = useMutation({
    mutationFn: (id: string) => api.delete(`/provider/listings/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-listings'] });
    },
  });

  const { data: inbox, isLoading: inboxLoading } = useQuery({
    queryKey: ['provider-inbox'],
    queryFn: () =>
      api.get<{ items: Order[]; total: number }>('/orders/provider/inbox').then((r) => r.data),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const setOrderStatus = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
    }) => api.patch(`/orders/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['provider-listings'] });
    },
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.post(`/orders/${id}/pay`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider-inbox'] }),
  });

  if (!user) return <Navigate to="/login" replace />;
  if (!canSell(user.role)) {
    return (
      <AccessDenied
        title="Providers only"
        message="This page is for providers who sell services, groceries and items. Customers shop from the marketplace instead."
        to="/marketplace"
        action="Browse the marketplace"
      />
    );
  }

  const set = (key: keyof ListingFormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const price = Number(form.price);
    if (Number.isNaN(price) || price < 0) {
      toastError('Please enter a valid price');
      return;
    }
    try {
      await createListing.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        price,
        unit: form.unit.trim() || undefined,
        quantity: form.quantity.trim() === '' ? undefined : Number(form.quantity),
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
      });
      toastSuccess('Listing created');
      setForm(EMPTY_FORM);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteListing.mutateAsync(id);
      toastSuccess('Listing deleted');
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  const handleExport = async () => {
    if (!data?.items.length) {
      toastError('Nothing to export yet');
      return;
    }
    try {
      const res = await api.get('/provider/listings/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `provider-listings-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess(`Exported ${data.items.length} listing(s) to Excel`);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  const formValid =
    form.title.trim().length >= 3 && form.description.trim().length >= 10 && form.price !== '';

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="spread mb-2">
        <div>
          <h1 className="mt-0 mb-1">Provider Studio</h1>
          <p className="muted mt-0" style={{ marginTop: 0 }}>
            Offer your services, groceries, or products to the marketplace.
          </p>
        </div>
        <div className="flex">
          <Link to="/marketplace" style={{ textDecoration: 'none' }}>
            <Button variant="ghost">🌊 View marketplace</Button>
          </Link>
          <Button variant="secondary" onClick={handleExport} disabled={isLoading}>
            📄 Export to Excel (.xlsx)
          </Button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(320px, 1fr) 1.4fr' }}>
        <Card padded>
          <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
            Add a new listing
          </h2>
          <form onSubmit={handleSubmit}>
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder="e.g. Fresh organic vegetables box"
            />
            <div className="field">
              <label htmlFor="category">Category</label>
              <div className="input-wrap">
                <select
                  id="category"
                  value={form.category}
                  onChange={(e) => set('category')(e.target.value)}
                >
                  {ProviderListingCategoryEnum.options.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <div className="input-wrap">
                <textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(e) => set('description')(e.target.value)}
                  placeholder="Describe what you offer (min 10 chars)"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Input
                label="Price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => set('price')(e.target.value)}
                placeholder="9.99"
              />
              <div className="field">
                <label htmlFor="unit">Unit (sold per)</label>
                <div className="input-wrap">
                  <select id="unit" value={form.unit} onChange={(e) => set('unit')(e.target.value)}>
                    <option value="">Select…</option>
                    {ProviderListingUnitEnum.options.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u] ?? u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <Input
              label="Quantity in stock (optional)"
              type="number"
              min="0"
              step="1"
              value={form.quantity}
              onChange={(e) => set('quantity')(e.target.value)}
              placeholder="e.g. 50"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Input
                label="Contact phone"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone')(e.target.value)}
                placeholder="+1 555 000 1234"
              />
              <Input
                label="Contact email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail')(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <Button type="submit" loading={createListing.isPending} disabled={!formValid} fullWidth>
              Add listing
            </Button>
          </form>
        </Card>

        <div>
          <div className="spread mb-1">
            <h2 className="mt-0" style={{ fontSize: '1.05rem' }}>
              My listings ({data?.total ?? 0})
            </h2>
            {isLoading && <span className="muted">Loading…</span>}
          </div>
          {data && data.items.length === 0 && (
            <Card padded>
              <p className="muted mt-0">No listings yet — add your first one on the left.</p>
            </Card>
          )}
          {data?.items.map((listing) => (
            <Card key={listing.id} padded className="mb-1">
              <div className="spread">
                <div>
                  <strong>{listing.title}</strong>{' '}
                  <span className="chip">
                    {CATEGORY_LABELS[listing.category] ?? listing.category}
                  </span>{' '}
                  <span className="chip">{listing.availability}</span>
                </div>
                <div className="flex">
                  <strong>
                    {formatPrice(listing.price, listing.currency)}
                    {listing.unit ? ` / ${UNIT_LABELS[listing.unit] ?? listing.unit}` : ''}
                  </strong>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deleteListing.isPending}
                    onClick={() => listing.id && handleDelete(listing.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <p className="mb-1" style={{ fontSize: '0.92rem' }}>
                {listing.description}
              </p>
              <div className="flex" style={{ gap: '1rem' }}>
                {listing.quantity !== undefined && (
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    In stock: {listing.quantity}
                  </span>
                )}
                {listing.contactPhone && (
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    📞 {listing.contactPhone}
                  </span>
                )}
                {listing.contactEmail && (
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    ✉️ {listing.contactEmail}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <h2 className="mb-1" style={{ fontSize: '1.05rem', marginTop: '2rem' }}>
        📥 Incoming orders ({inbox?.total ?? 0})
      </h2>
      {inboxLoading && <p className="muted">Loading orders…</p>}
      {!inboxLoading && (!inbox || inbox.items.length === 0) && (
        <Card padded>
          <p className="muted mt-0">No orders yet — customers will appear here once they order.</p>
        </Card>
      )}
      {inbox?.items.map((order) => (
        <Card key={order.id} padded className="mb-1">
          <div className="spread mb-1">
            <div className="flex">
              <strong>Order #{order.id?.slice(-6).toUpperCase()}</strong>
              <span className="chip">{order.status}</span>
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
          <div className="spread" style={{ marginTop: '0.75rem' }}>
            <strong>
              Your share: {formatPrice(orderTotalForProvider(order, user.id), order.currency)}
            </strong>
            <div className="flex">
              {order.status === 'pending' && (
                <>
                  <Button
                    size="sm"
                    loading={setOrderStatus.isPending}
                    onClick={() =>
                      order.id && setOrderStatus.mutate({ id: order.id, status: 'confirmed' })
                    }
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={setOrderStatus.isPending}
                    onClick={() =>
                      order.id && setOrderStatus.mutate({ id: order.id, status: 'cancelled' })
                    }
                  >
                    Cancel
                  </Button>
                </>
              )}
              {order.status === 'confirmed' && (
                <Button
                  size="sm"
                  loading={setOrderStatus.isPending}
                  onClick={() =>
                    order.id && setOrderStatus.mutate({ id: order.id, status: 'shipped' })
                  }
                >
                  🚚 Mark shipped
                </Button>
              )}
              {order.status === 'shipped' && (
                <Button
                  size="sm"
                  loading={setOrderStatus.isPending}
                  onClick={() =>
                    order.id && setOrderStatus.mutate({ id: order.id, status: 'delivered' })
                  }
                >
                  🎉 Mark delivered
                </Button>
              )}
              {order.paymentStatus === 'unpaid' && order.id && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={markPaid.isPending}
                  onClick={() => order.id && markPaid.mutate(order.id)}
                >
                  💰 Mark paid
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

import { type ProviderListing, ProviderListingCategoryEnum } from '@alpha/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { canBuy } from '../lib/roles';
import { formatPrice } from '../lib/utils';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';
import { useCartStore } from '../stores/useCartStore';

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

const CATEGORY_EMOJI: Record<string, string> = {
  service: '🛠️',
  grocery: '🥦',
  item: '📦',
  other: '✨',
};

export function MarketplacePage() {
  const [category, setCategory] = useState<string>('all');
  const user = useAuthStore((s) => s.user);
  const buyer = canBuy(user?.role);
  const addItem = useCartStore((s) => s.addItem);

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', category],
    queryFn: () =>
      api
        .get<{ items: ProviderListing[]; total: number }>('/provider/listings', {
          params: category === 'all' ? {} : { category },
        })
        .then((r) => r.data),
    // Stock changes as customers order — refresh so sold-out items vanish automatically.
    refetchInterval: 30_000,
  });

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="spread mb-2">
        <div>
          <h1 className="mt-0 mb-1">🌊 Local Marketplace</h1>
          <p className="muted mt-0">
            Groceries, dairy, home essentials and more — straight from local providers.
          </p>
        </div>
      </div>

      <div className="flex mb-2" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn btn-sm ${category === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {ProviderListingCategoryEnum.options.map((c) => (
          <button
            key={c}
            type="button"
            className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_EMOJI[c]} {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {isLoading && <p className="muted">Loading marketplace…</p>}
      {!isLoading && data && data.items.length === 0 && (
        <Card padded>
          <p className="muted mt-0">No listings in this category yet — check back soon.</p>
        </Card>
      )}

      <div className="grid">
        {data?.items.map((listing) => (
          <Card key={listing.id} padded interactive>
            <div className="spread mb-1">
              <span className="chip">
                {CATEGORY_EMOJI[listing.category]}{' '}
                {CATEGORY_LABELS[listing.category] ?? listing.category}
              </span>
              <strong style={{ color: 'var(--primary)', fontSize: '1.05rem' }}>
                {formatPrice(listing.price, listing.currency)}
                {listing.unit ? (
                  <span className="muted" style={{ fontWeight: 500 }}>
                    {' '}
                    / {UNIT_LABELS[listing.unit] ?? listing.unit}
                  </span>
                ) : null}
              </strong>
            </div>
            <h3 className="mt-0 mb-1" style={{ fontSize: '1rem' }}>
              {listing.title}
            </h3>
            {listing.providerName && (
              <p className="muted mt-0 mb-1" style={{ fontSize: '0.8rem' }}>
                👤 {listing.providerName}
              </p>
            )}
            <p className="mb-1 muted" style={{ fontSize: '0.9rem' }}>
              {listing.description}
            </p>
            <div className="flex" style={{ gap: '1rem', fontSize: '0.85rem' }}>
              {listing.quantity !== undefined && (
                <span className="muted">In stock: {listing.quantity}</span>
              )}
              {listing.contactPhone && <span className="muted">📞 {listing.contactPhone}</span>}
              {listing.contactEmail && <span className="muted">✉️ {listing.contactEmail}</span>}
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              {buyer ? (
                <Button
                  size="sm"
                  disabled={
                    listing.availability !== 'available' ||
                    (listing.quantity !== undefined && listing.quantity === 0)
                  }
                  onClick={() => {
                    if (!listing.id) return;
                    addItem({
                      listingId: listing.id,
                      title: listing.title,
                      price: listing.price,
                      currency: listing.currency,
                      unit: listing.unit,
                    });
                    toastSuccess('Added to cart');
                  }}
                >
                  🛒 Add to cart
                </Button>
              ) : user?.role === 'provider' ? (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  🔍 Browsing as a seller — customers buy from here
                </span>
              ) : (
                <Link to="/login" style={{ textDecoration: 'none' }}>
                  <Button size="sm">Log in to buy</Button>
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

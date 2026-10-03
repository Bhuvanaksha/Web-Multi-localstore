import type { ProviderListing } from '@alpha/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResourceCard } from '../features/ResourceCard';
import { useResourcesQuery } from '../hooks/useResources';
import { api } from '../lib/api';
import { canBuy } from '../lib/roles';
import { formatPrice } from '../lib/utils';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Skeleton } from '../shared/ui/Skeleton';
import { toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';
import { useCartStore } from '../stores/useCartStore';

const CATEGORIES = ['All', 'Engineering', 'Database', 'Community'];

const LISTING_CATEGORY_EMOJI: Record<string, string> = {
  service: '🛠️',
  grocery: '🥦',
  item: '📦',
  other: '✨',
};

const LISTING_CATEGORY_LABELS: Record<string, string> = {
  service: 'Service',
  grocery: 'Grocery',
  item: 'Item',
  other: 'Other',
};

const LISTING_UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  l: 'L',
  units: 'units',
  pcs: 'pcs',
  other: 'other',
};

export function HomePage() {
  const [category, setCategory] = useState('All');
  const filters = useMemo(() => (category === 'All' ? {} : { category }), [category]);
  const feed = useResourcesQuery(filters);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll: fetch the next page when the sentinel becomes visible.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) {
        void feed.fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="page">
      <LatestListings />

      <div className="spread mb-2">
        <h1 className="mt-0">Latest resources</h1>
        <div className="flex">
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? 'primary' : 'ghost'}
              onClick={() => setCategory(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {feed.isPending ? (
        <div className="grid">
          {['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
            <div key={k} className="card card-padded">
              <Skeleton height="1.2rem" width="70%" />
              <Skeleton height="0.9rem" width="100%" style={{ marginTop: '0.6rem' }} />
              <Skeleton height="0.9rem" width="80%" style={{ marginTop: '0.4rem' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="muted">No published resources yet.</p>
      ) : (
        <div className="grid">
          {items.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 40, marginTop: '1rem' }}>
        {feed.isFetchingNextPage && <Skeleton height="3rem" />}
      </div>
    </div>
  );
}

/** Recent marketplace listings — keeps the home page alive with real items. */
function LatestListings() {
  const user = useAuthStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);
  const buyer = canBuy(user?.role);

  const { data, isLoading } = useQuery({
    queryKey: ['home-listings'],
    queryFn: () =>
      api
        .get<{ items: ProviderListing[]; total: number }>('/provider/listings', {
          params: { limit: 6 },
        })
        .then((r) => r.data),
    refetchInterval: 60_000,
  });

  const listings = data?.items ?? [];

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div className="spread mb-1">
        <div>
          <h1 className="mt-0 mb-1" style={{ fontSize: '1.35rem' }}>
            🌊 Fresh from the marketplace
          </h1>
          <p className="muted mt-0">
            Groceries, dairy, services and items from local providers — in ₹, sold by kg / L / pcs.
          </p>
        </div>
        <Link to="/marketplace">
          <Button variant="ghost" size="sm">
            View all →
          </Button>
        </Link>
      </div>
      {isLoading ? (
        <div className="grid">
          {['a', 'b', 'c'].map((k) => (
            <div key={k} className="card card-padded">
              <Skeleton height="1rem" width="60%" />
              <Skeleton height="0.9rem" width="90%" style={{ marginTop: '0.5rem' }} />
            </div>
          ))}
        </div>
      ) : listings.length === 0 ? (
        <Card padded>
          <p className="muted mt-0">
            No listings yet — providers are setting up their shops. Check back soon!
          </p>
        </Card>
      ) : (
        <div className="grid">
          {listings.map((listing) => (
            <Card key={listing.id} padded interactive>
              <div className="spread mb-1">
                <span className="chip">
                  {LISTING_CATEGORY_EMOJI[listing.category]}{' '}
                  {LISTING_CATEGORY_LABELS[listing.category] ?? listing.category}
                </span>
                <strong style={{ color: 'var(--primary)' }}>
                  {formatPrice(listing.price, listing.currency)}
                  {listing.unit ? (
                    <span className="muted" style={{ fontWeight: 500 }}>
                      {' '}
                      / {LISTING_UNIT_LABELS[listing.unit] ?? listing.unit}
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
              {listing.quantity !== undefined && (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  In stock: {listing.quantity}
                </span>
              )}
              {buyer && (
                <div style={{ marginTop: '0.75rem' }}>
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
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

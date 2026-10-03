import { type PaymentMethod, PaymentMethodEnum } from '@alpha/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { canBuy } from '../lib/roles';
import { formatPrice } from '../lib/utils';
import { AccessDenied } from '../shared/ui/AccessDenied';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';
import { useCartStore } from '../stores/useCartStore';

interface DeliveryForm {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
}

const EMPTY_DELIVERY: DeliveryForm = {
  fullName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  landmark: '',
};

export function CartPage() {
  const user = useAuthStore((s) => s.user);
  const { items, setQuantity, removeItem, clear, totalPrice } = useCartStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [delivery, setDelivery] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');

  const checkout = useMutation({
    mutationFn: () =>
      api
        .post('/orders', {
          items: items.map((i) => ({ listingId: i.listingId, quantity: i.quantity })),
          note: note.trim() || undefined,
          paymentMethod,
          delivery: {
            fullName: delivery.fullName.trim(),
            phone: delivery.phone.trim(),
            addressLine1: delivery.addressLine1.trim(),
            addressLine2: delivery.addressLine2.trim() || undefined,
            city: delivery.city.trim(),
            state: delivery.state.trim(),
            pincode: delivery.pincode.trim(),
            landmark: delivery.landmark.trim() || undefined,
          },
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    },
  });

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

  const deliveryValid =
    delivery.fullName.trim().length >= 2 &&
    delivery.phone.trim().replace(/[^0-9]/g, '').length >= 10 &&
    delivery.addressLine1.trim().length >= 5 &&
    delivery.city.trim().length >= 2 &&
    delivery.state.trim().length >= 2 &&
    /^[0-9]{6}$/.test(delivery.pincode.trim());

  const set = (key: keyof DeliveryForm) => (value: string) =>
    setDelivery((d) => ({ ...d, [key]: value }));

  const handleCheckout = async () => {
    if (!deliveryValid) {
      toastError(
        'Please fill in the delivery details (name, phone, address, city, state, 6-digit PIN)',
      );
      return;
    }
    try {
      const res = await checkout.mutateAsync();
      clear();
      toastSuccess(`Order placed — ₹${res.order.totalPrice.toLocaleString('en-IN')}`);
      navigate('/orders');
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  if (items.length === 0) {
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <h1 className="mt-0">🛒 Your cart</h1>
        <Card padded>
          <p className="muted mt-0">
            Your cart is empty. Browse the marketplace and add something!
          </p>
          <Button onClick={() => navigate('/marketplace')}>Go to marketplace</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1 className="mt-0">🛒 Your cart</h1>
      {items.map((item) => (
        <Card key={item.listingId} padded className="mb-1">
          <div className="spread">
            <div>
              <strong>{item.title}</strong>
              {item.unit && (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {' '}
                  per {item.unit}
                </span>
              )}
            </div>
            <div className="flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuantity(item.listingId, item.quantity - 1)}
              >
                −
              </Button>
              <span style={{ minWidth: '2rem', textAlign: 'center' }}>{item.quantity}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuantity(item.listingId, item.quantity + 1)}
              >
                +
              </Button>
              <strong style={{ minWidth: '6rem', textAlign: 'right' }}>
                {formatPrice(item.price * item.quantity, item.currency)}
              </strong>
              <Button variant="danger" size="sm" onClick={() => removeItem(item.listingId)}>
                Remove
              </Button>
            </div>
          </div>
        </Card>
      ))}{' '}
      <Card padded className="mb-1">
        <h2 className="mt-0 mb-1" style={{ fontSize: '1.05rem' }}>
          📍 Delivery details
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="field">
            <label htmlFor="delivery-name">Recipient name *</label>
            <div className="input-wrap">
              <input
                id="delivery-name"
                value={delivery.fullName}
                onChange={(e) => set('fullName')(e.target.value)}
                placeholder="e.g. Priya Sharma"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="delivery-phone">Phone number *</label>
            <div className="input-wrap">
              <input
                id="delivery-phone"
                type="tel"
                value={delivery.phone}
                onChange={(e) => set('phone')(e.target.value)}
                placeholder="10-digit mobile"
              />
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="delivery-address">Address *</label>
          <div className="input-wrap">
            <input
              id="delivery-address"
              value={delivery.addressLine1}
              onChange={(e) => set('addressLine1')(e.target.value)}
              placeholder="House no, street, area"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="delivery-address2">Address line 2 (optional)</label>
          <div className="input-wrap">
            <input
              id="delivery-address2"
              value={delivery.addressLine2}
              onChange={(e) => set('addressLine2')(e.target.value)}
              placeholder="Apartment, floor, building"
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div className="field">
            <label htmlFor="delivery-city">City *</label>
            <div className="input-wrap">
              <input
                id="delivery-city"
                value={delivery.city}
                onChange={(e) => set('city')(e.target.value)}
                placeholder="e.g. Mumbai"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="delivery-state">State *</label>
            <div className="input-wrap">
              <input
                id="delivery-state"
                value={delivery.state}
                onChange={(e) => set('state')(e.target.value)}
                placeholder="e.g. Maharashtra"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="delivery-pincode">PIN code *</label>
            <div className="input-wrap">
              <input
                id="delivery-pincode"
                value={delivery.pincode}
                onChange={(e) => set('pincode')(e.target.value)}
                placeholder="6 digits, e.g. 400001"
                maxLength={6}
              />
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="delivery-landmark">Landmark (optional)</label>
          <div className="input-wrap">
            <input
              id="delivery-landmark"
              value={delivery.landmark}
              onChange={(e) => set('landmark')(e.target.value)}
              placeholder="e.g. Near City Mall"
            />
          </div>
        </div>
      </Card>
      <Card padded className="mb-1">
        <div className="field">
          <label htmlFor="order-note">Note to provider (optional)</label>
          <div className="input-wrap">
            <input
              id="order-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Deliver after 6 PM"
            />
          </div>
        </div>
        <div className="field">
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Payment method</span>
          <div className="flex" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
            {PaymentMethodEnum.options.map((method) => (
              <button
                key={method}
                type="button"
                className={`btn btn-sm ${paymentMethod === method ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPaymentMethod(method)}
              >
                {method === 'upi' ? '📱 UPI' : method === 'cod' ? '💵 Cash on Delivery' : '💳 Card'}
              </button>
            ))}
          </div>
          <p className="muted mb-1" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
            {paymentMethod === 'cod'
              ? 'Pay the provider when your order is delivered.'
              : 'Payment is processed instantly (demo gateway).'}
          </p>
        </div>
        <div className="spread">
          <strong style={{ fontSize: '1.1rem' }}>Total: {formatPrice(totalPrice(), 'INR')}</strong>
          <Button onClick={handleCheckout} loading={checkout.isPending} size="lg">
            {paymentMethod === 'cod' ? 'Place order (COD)' : 'Pay & place order'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

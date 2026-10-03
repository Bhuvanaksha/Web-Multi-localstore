/** Joins class names, ignoring falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Formats a price with its currency symbol (₹ for INR, $ for USD). */
export function formatPrice(price: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  // en-IN gives Indian digit grouping (e.g. 1,00,000) which suits ₹.
  return `${symbol}${price.toLocaleString('en-IN')}`;
}

export function formatDate(input?: string | Date): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

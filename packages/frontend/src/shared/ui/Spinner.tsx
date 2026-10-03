import { cx } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('spinner', className)} aria-label="Loading" role="status" />;
}

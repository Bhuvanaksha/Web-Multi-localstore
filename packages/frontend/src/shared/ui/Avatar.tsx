import { cx } from '../../lib/utils';

export interface AvatarProps {
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  name?: string;
  className?: string;
}

const sizeClass = { sm: 'avatar-sm', md: 'avatar-md', lg: 'avatar-lg' } as const;

export function Avatar({ src, size = 'md', name, className }: AvatarProps) {
  const fallback = (name ?? '?').trim().charAt(0).toUpperCase();
  return src ? (
    <img src={src} alt={name ?? 'avatar'} className={cx('avatar', sizeClass[size], className)} />
  ) : (
    <span
      className={cx('avatar', 'avatar-fallback', sizeClass[size], className)}
      aria-hidden="true"
    >
      {fallback}
    </span>
  );
}

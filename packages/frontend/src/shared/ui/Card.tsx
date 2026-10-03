import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
  interactive?: boolean;
}

export function Card({
  children,
  padded = true,
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx('card', padded && 'card-padded', interactive && 'card-interactive', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

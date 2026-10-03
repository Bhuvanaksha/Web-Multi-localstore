import type { CSSProperties } from 'react';
import { cx } from '../../lib/utils';

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}

export function Skeleton({ className, width, height, style }: SkeletonProps) {
  return (
    <div
      className={cx('skeleton', className)}
      style={{ width: width ?? '100%', height: height ?? '1rem', ...style }}
      aria-hidden="true"
    />
  );
}

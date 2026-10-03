import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cx } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, icon, className, id, ...rest },
  ref,
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className={cx('field', className)}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className={cx('input-wrap', error && 'input-error')}>
        {icon && <span className="input-icon">{icon}</span>}
        <input ref={ref} id={inputId} className={cx(icon ? 'with-icon' : undefined)} {...rest} />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

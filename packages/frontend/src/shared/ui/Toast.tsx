import { create } from 'zustand';
import { cx } from '../../lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toastSuccess(message: string) {
  useToastStore.getState().push('success', message);
}
export function toastError(message: string) {
  useToastStore.getState().push('error', message);
}
export function toastInfo(message: string) {
  useToastStore.getState().push('info', message);
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          className={cx('toast', `toast-${t.kind}`)}
          onClick={() => dismiss(t.id)}
          type="button"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

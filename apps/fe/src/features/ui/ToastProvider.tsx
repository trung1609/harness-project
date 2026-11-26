'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextToastId++;
      setItems((prev) => [...prev.slice(-4), { id, variant, message }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 4200);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (msg) => push('success', msg),
        error: (msg) => push('error', msg),
        info: (msg) => push('info', msg),
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
      >
        {items.map((item) => {
          const style =
            item.variant === 'error'
              ? 'border-rose-200 bg-white text-rose-900'
              : item.variant === 'success'
                ? 'border-emerald-200 bg-white text-emerald-900'
                : 'border-blue-200 bg-white text-slate-900';

          const Icon =
            item.variant === 'error'
              ? AlertCircle
              : item.variant === 'success'
                ? CheckCircle2
                : Info;

          const iconColor =
            item.variant === 'error'
              ? 'text-rose-600'
              : item.variant === 'success'
                ? 'text-emerald-600'
                : 'text-blue-600';

          return (
            <div
              key={item.id}
              role="alert"
              className={`animate-modal-in pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg ${style}`}
            >
              <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${iconColor}`} strokeWidth={2} />
              <p className="flex-1 text-sm font-medium leading-snug">
                {item.message}
              </p>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx.toast;
}

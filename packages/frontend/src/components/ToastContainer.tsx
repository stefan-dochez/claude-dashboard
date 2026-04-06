import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import type { Toast } from '../hooks/useToasts';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ICON_MAP = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const COLOR_MAP = {
  success: 'border-green-500/30 bg-green-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
} as const;

const ICON_COLOR_MAP = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-blue-400',
} as const;

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map(toast => {
        const Icon = ICON_MAP[toast.type];
        return (
          <div
            key={toast.id}
            className={`toast-enter flex max-w-sm items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-sm ${COLOR_MAP[toast.type]}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_COLOR_MAP[toast.type]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-neutral-200">{toast.message}</p>
              {toast.detail && (
                <p className="mt-0.5 whitespace-pre-line text-[11px] text-neutral-400">{toast.detail}</p>
              )}
            </div>
            <button
              onClick={() => onRemove(toast.id)}
              className="shrink-0 rounded p-0.5 text-neutral-500 transition-colors hover:text-neutral-300"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

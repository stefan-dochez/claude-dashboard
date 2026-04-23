import { useState, useEffect } from 'react';
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

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);

  // Timer resets each time the pointer leaves the toast — the user gets a
  // fresh `toast.duration` window to read after un-hovering, even if they
  // hover multiple times.
  useEffect(() => {
    if (hovered) return;
    const timer = setTimeout(() => onRemove(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [hovered, toast.id, toast.duration, onRemove]);

  const Icon = ICON_MAP[toast.type];
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`toast-enter flex max-w-sm items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-sm ${COLOR_MAP[toast.type]}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_COLOR_MAP[toast.type]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-primary">{toast.message}</p>
        {toast.detail && (
          <p className="mt-0.5 whitespace-pre-line break-words text-[12px] text-tertiary [overflow-wrap:anywhere]">{toast.detail}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-secondary"
        aria-label="Close notification"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite" role="status">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

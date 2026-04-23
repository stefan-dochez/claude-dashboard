import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
  /** Auto-dismiss delay in ms. The per-toast timer lives in ToastContainer so it can be paused on hover. */
  duration: number;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast['type'], message: string, detail?: string, duration = 4000) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message, detail, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

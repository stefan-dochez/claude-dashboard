import { useEffect, useRef, useCallback, useState } from 'react';
import { useSocket, useSocketEvent } from './useSocket';
import type { Instance } from '../types';

interface NotificationConfig {
  enabled: boolean;
  sound: boolean;
}

export function useNotifications(
  instances: Instance[],
  config: NotificationConfig | null,
  onSelectInstance?: (id: string) => void,
) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  // Request permission on first enable
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      setPermission(result);
    }
  }, []);

  useEffect(() => {
    if (config?.enabled && permission === 'default') {
      requestPermission();
    }
  }, [config?.enabled, permission, requestPermission]);

  // Track status transitions and fire notifications
  useSocketEvent<{ instanceId: string; status: string }>('instance:status', useCallback(({ instanceId, status }) => {
    if (!config?.enabled || permission !== 'granted') return;
    if (document.hasFocus()) return;

    const prevStatus = prevStatusRef.current.get(instanceId);
    prevStatusRef.current.set(instanceId, status);

    // Only notify on transition TO waiting_input from a different state
    if (status !== 'waiting_input' || prevStatus === 'waiting_input') return;

    const instance = instances.find(i => i.id === instanceId);
    const title = instance?.projectName ?? 'Claude';
    const body = instance?.taskDescription ?? 'Instance is waiting for input';

    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: `waiting-${instanceId}`,
      silent: !config.sound,
    });

    notification.onclick = () => {
      window.focus();
      onSelectInstance?.(instanceId);
      notification.close();
    };
  }, [config?.enabled, config?.sound, permission, instances, onSelectInstance]));

  // Keep prevStatusRef in sync with current instances
  useEffect(() => {
    for (const inst of instances) {
      prevStatusRef.current.set(inst.id, inst.status);
    }
    // Clean up removed instances
    const activeIds = new Set(instances.map(i => i.id));
    for (const id of prevStatusRef.current.keys()) {
      if (!activeIds.has(id)) {
        prevStatusRef.current.delete(id);
      }
    }
  }, [instances]);

  // Update app badge count (Web Badge API — works in Electron and some browsers)
  const waitingCount = instances.filter(i => i.status === 'waiting_input').length;

  useEffect(() => {
    if ('setAppBadge' in navigator) {
      if (waitingCount > 0) {
        (navigator as unknown as { setAppBadge: (n: number) => Promise<void> }).setAppBadge(waitingCount);
      } else {
        (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
      }
    }
  }, [waitingCount]);

  // Fire a test notification on demand (bypasses focus and instance checks)
  // Returns a diagnostic result so the caller can display feedback
  const sendTestNotification = useCallback(async (): Promise<
    { status: 'sent' } |
    { status: 'unsupported' } |
    { status: 'denied' } |
    { status: 'dismissed' } |
    { status: 'error'; message: string }
  > => {
    if (typeof Notification === 'undefined') {
      return { status: 'unsupported' };
    }

    let currentPermission = Notification.permission;

    // Request permission if not yet decided
    if (currentPermission === 'default') {
      try {
        currentPermission = await Notification.requestPermission();
        setPermission(currentPermission);
      } catch (err) {
        return { status: 'error', message: err instanceof Error ? err.message : 'Permission request failed' };
      }
    }

    if (currentPermission === 'denied') {
      return { status: 'denied' };
    }

    if (currentPermission !== 'granted') {
      return { status: 'dismissed' };
    }

    try {
      const notification = new Notification('Claude Dashboard', {
        body: 'Notifications are working!',
        icon: '/favicon.svg',
        tag: 'test-notification',
        silent: !config?.sound,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return { status: 'sent' };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : 'Failed to create notification' };
    }
  }, [config?.sound]);

  return { permission, requestPermission, sendTestNotification };
}

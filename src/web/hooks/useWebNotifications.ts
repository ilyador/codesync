import { useState, useEffect, useCallback } from 'react';

const DISMISS_KEY = 'codesync-notif-dismissed';

export function useWebNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISS_KEY) === '1'
  );

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {
      // Notification constructor can throw in some environments
    }
  }, []);

  const showPrompt = permission === 'default' && !dismissed;

  return { permission, showPrompt, requestPermission, dismiss, notify };
}

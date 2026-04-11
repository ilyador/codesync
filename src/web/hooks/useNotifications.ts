import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, type NotificationRecord } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

export function useNotifications(userId: string | undefined, currentProjectId: string | null) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    queueMicrotask(() => {
      void load();
    });
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [userId, load]);

  useEffect(() => {
    if (!userId || !currentProjectId) return;
    void load();
    const unsub = subscribeProjectEvents(currentProjectId, (event) => {
      if (event.type === 'notification_changed' || event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [userId, currentProjectId, load]);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function markRead(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  return { notifications, unreadCount, markRead, markAllRead };
}

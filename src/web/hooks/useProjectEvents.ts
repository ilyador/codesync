import { subscribeToChanges } from '../lib/api';

type Callback = (event: any) => void;
const subscriptions = new Map<string, { unsub: () => void; callbacks: Set<Callback> }>();

function connectProject(projectId: string, callbacks: Set<Callback>) {
  const unsub = subscribeToChanges(projectId, (event) => {
    for (const fn of callbacks) fn(event);
  });
  return unsub;
}

export function subscribeProjectEvents(projectId: string, cb: Callback): () => void {
  let sub = subscriptions.get(projectId);
  if (!sub) {
    const callbacks = new Set<Callback>();
    const unsub = connectProject(projectId, callbacks);
    sub = { unsub, callbacks };
    subscriptions.set(projectId, sub);
  }
  sub.callbacks.add(cb);

  return () => {
    const s = subscriptions.get(projectId);
    if (!s) return;
    s.callbacks.delete(cb);
    if (s.callbacks.size === 0) {
      s.unsub();
      subscriptions.delete(projectId);
    }
  };
}

// Close SSE connections when page is hidden (improves iOS bfcache eligibility)
// Reopen when page becomes visible again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Close all connections
      for (const [, sub] of subscriptions) {
        sub.unsub();
      }
    } else {
      // Reconnect all active subscriptions
      for (const [projectId, sub] of subscriptions) {
        sub.unsub = connectProject(projectId, sub.callbacks);
      }
    }
  });
}

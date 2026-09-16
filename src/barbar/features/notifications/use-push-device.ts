import { useEffect, useState } from 'react';
import { api } from '../../services/api-client';
import { useBar } from '../../app/providers/BarProvider';
export const pushSupported = () =>
  typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
let pushConfig: Promise<{ publicKey: string | null }> | undefined;
/** The server's public key never changes within a session: one request, shared by every panel opening. */
export function loadPushConfig() {
  pushConfig ||= api('/api/barbar/push').catch((error: unknown) => {
    pushConfig = undefined;
    throw error;
  });
  return pushConfig;
}
export type PushDevice = ReturnType<typeof usePushDevice>;
export function usePushDevice() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [error, setError] = useState('');
  const { perform: execute, busy } = useBar();
  useEffect(() => {
    let active = true;
    if (pushSupported() && Notification.permission === 'granted') {
      void navigator.serviceWorker
        .getRegistration('/barbar-sw.js')
        .then(async (registration) => {
          const sub = await registration?.pushManager.getSubscription();
          if (sub && active) {
            await api('/api/barbar/push', {
              method: 'POST',
              body: JSON.stringify({
                subscription: sub.toJSON(),
                visible: document.visibilityState === 'visible',
              }),
            });
            if (active) setSubscription(sub);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!subscription) return;
    const heartbeat = (visible = document.visibilityState === 'visible') => {
      void api('/api/barbar/push', {
        method: 'PATCH',
        keepalive: true,
        body: JSON.stringify({ subscription: subscription.toJSON(), visible }),
      }).catch(() => {});
    };
    const onVisibility = () => heartbeat();
    const onPageHide = () => heartbeat(false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') heartbeat();
    }, 60000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [subscription]);
  const toggle = (publicKey: string | null) =>
    execute(async () => {
      setError('');
      try {
        if (subscription) {
          await api('/api/barbar/push', {
            method: 'DELETE',
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          });
          await subscription.unsubscribe();
          setSubscription(null);
        } else {
          if (!publicKey) throw new Error('Системные уведомления ещё не настроены на сервере.');
          if ((await Notification.requestPermission()) !== 'granted')
            throw new Error('Разрешите уведомления в настройках браузера.');
          const registration = await navigator.serviceWorker.register('/barbar-sw.js', { scope: '/' });
          await navigator.serviceWorker.ready;
          const raw = atob(publicKey.replaceAll('-', '+').replaceAll('_', '/'));
          const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
          const sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
          await api('/api/barbar/push', {
            method: 'POST',
            body: JSON.stringify({ subscription: sub.toJSON(), visible: true }),
          });
          setSubscription(sub);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось включить уведомления.');
      }
    });
  return { enabled: !!subscription, toggle, busy, error };
}

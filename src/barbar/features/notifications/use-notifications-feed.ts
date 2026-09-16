import { useCallback, useEffect, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import type { FeedItem } from '../../domain/notifications/feed';
import { api } from '../../services/api-client';

/** Recent queued notifications for this role, newest first. Reloads when the ledger changes. */
export function useNotificationsFeed() {
  const { data } = useBar();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api('/api/barbar/notifications')
      .then((result) => {
        if (active) {
          setItems(result.items || []);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить уведомления.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [data, version]);
  return { items, loading, error, reload };
}

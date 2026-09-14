import { useEffect, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { api } from '../../services/api-client';
import type { HistoryPage, SalesGroup } from '../../domain/reports/server-types';
import type { Sale } from '../../domain/types';
export function useHistory<T = Sale>(
  collection: 'sales' | 'purchases' | 'stockMovements' | 'stockResets' | 'expenses',
  from: string,
  to = from,
) {
  const { data, staffData } = useBar();
  const enabled = !!data.opening || !!staffData?.paged;
  const key = collection + from + to;
  const [cursor, setCursor] = useState<{ key: string; value: string | null }>({ key, value: null });
  const [state, setState] = useState<{ key: string; value: HistoryPage<T> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pageCursor = cursor.key === key ? cursor.value : null;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      collection,
      from,
      to,
      ...(pageCursor ? { cursor: pageCursor } : {}),
    });
    void api(`/api/barbar/history?${params}`)
      .then((result) => {
        if (!stopped)
          setState((previous) => ({
            key,
            value: {
              ...result,
              rows: result.rows as T[],
              groups: result.groups || (previous?.key === key ? previous.value.groups : []),
            },
          }));
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [data, staffData, enabled, collection, from, to, pageCursor, key]);
  const value = state?.key === key ? state.value : null;
  return {
    enabled,
    rows: value?.rows || [],
    groups: value?.groups || ([] as SalesGroup[]),
    total: value?.total || 0,
    nextCursor: value?.nextCursor || null,
    next: () => setCursor({ key, value: value?.nextCursor || null }),
    first: () => setCursor({ key, value: null }),
    hasPrevious: !!pageCursor,
    loading,
    error,
  };
}

import { useEffect, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { ordersSnapshot } from '../../domain/orders';
import type { BarTable, Order, Sale, StaffSale } from '../../domain/types';
import { snapshotRead } from '../../services/api-client';

export interface OrdersState {
  tables: BarTable[];
  orders: Order[];
  sales: (Sale | StaffSale)[];
}
const empty: OrdersState = { tables: [], orders: [], sales: [] };

/**
 * Tables and open receipts for the board and the order screen. One read per loaded snapshot: a
 * write or a poll brings a new snapshot object and the board refreshes with it.
 */
export function useOrders() {
  const { data, staffData } = useBar();
  const snapshot = staffData?.paged ? staffData : data;
  const [state, setState] = useState<{ snapshot: object; value: OrdersState } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    setError('');
    void snapshotRead(snapshot, '/api/barbar/orders')
      .then((result) => {
        if (!stopped) setState({ snapshot, value: ordersSnapshot(result) });
      })
      .catch((e) => {
        if (stopped) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить столы.');
        setState((previous) => previous || { snapshot, value: empty });
      });
    return () => {
      stopped = true;
    };
  }, [snapshot]);
  // The previous board stays on screen while the next snapshot loads; only the first load is empty.
  // `refreshing` tells a screen that what it just wrote may not be listed yet.
  return {
    ...(state?.value || empty),
    loading: !state,
    refreshing: !!state && state.snapshot !== snapshot,
    error,
  };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import {
  staffLevels,
  stockLevels,
  stockTransitions,
  type StockAlert,
  type StockLevel,
} from '../../domain/notifications/stock-alerts';

function useStockSnapshot() {
  const { data, staffData, role, hasData } = useBar();
  return useMemo(
    () =>
      !hasData ? null : role === 'admin' ? stockLevels(data) : staffData ? staffLevels(staffData) : null,
    [data, staffData, role, hasData],
  );
}

/** Live warnings: items that crossed a threshold since the previous snapshot, until dismissed or restocked. */
export function useStockAlerts() {
  const snapshot = useStockSnapshot();
  const previous = useRef<StockLevel[] | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  useEffect(() => {
    if (!snapshot) return;
    const changes = previous.current ? stockTransitions(previous.current, snapshot) : [];
    previous.current = snapshot;
    setAlerts((old) => {
      const retained = old.filter(
        (a) =>
          !changes.some((c) => c.id === a.id) &&
          snapshot.some((s) => s.id === a.id && s.quantity <= a.quantity),
      );
      return changes.length || retained.length !== old.length ? [...retained, ...changes].slice(-8) : old;
    });
  }, [snapshot]);
  const dismiss = (id: string) => setAlerts((old) => old.filter((a) => a.id !== id));
  return { alerts, dismiss };
}

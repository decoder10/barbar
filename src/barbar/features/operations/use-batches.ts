import { useEffect, useMemo, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { batchStock, type BatchStock } from '../../domain/batches';
import { stockTotals } from '../../domain/model';
import { snapshotRead } from '../../services/api-client';

/** Server FEFO balances for the compact working model; a full local ledger is computed in place. */
export function useBatches() {
  const { data } = useBar();
  const remote = !!data.opening;
  const local = useMemo(
    () => (remote ? [] : batchStock(data.stockMovements || [], stockTotals(data))),
    [data, remote],
  );
  const [state, setState] = useState<{ value: BatchStock[]; error: string } | null>(null);
  useEffect(() => {
    if (!remote) return;
    let active = true;
    void snapshotRead(data, '/api/barbar/batches')
      .then((result) => {
        if (active) setState({ value: result.batches, error: '' });
      })
      .catch((error) => {
        if (active) setState({ value: [], error: error instanceof Error ? error.message : 'Ошибка' });
      });
    return () => {
      active = false;
    };
  }, [data, remote]);
  return remote
    ? { batches: state?.value || [], loading: !state, error: state?.error || '' }
    : { batches: local, loading: false, error: '' };
}

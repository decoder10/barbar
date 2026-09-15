import { useEffect, useState } from 'react';
import { businessToday } from '../../domain/business-day';
import { snapshotRead } from '../../services/api-client';
import { useBar } from '../../app/providers/BarProvider';
import type { ServerReport } from '../../domain/reports/server-types';
export function useServerReport(from: string, to: string, lead = 3, reserve = 4) {
  const { data } = useBar();
  to = to > businessToday() ? businessToday() : to;
  const key = [from, to, lead, reserve].join(':');
  const [state, setState] = useState<{ key: string; report: ServerReport } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!data.opening) return;
    let cancelled = false;
    setError('');
    setLoading(true);
    void snapshotRead(
      data,
      `/api/barbar/report?${new URLSearchParams({ from, to, lead: String(lead), reserve: String(reserve) })}`,
    )
      .then((report) => {
        if (!cancelled) setState({ key, report });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, from, to, lead, reserve, key]);
  return { report: state?.key === key ? state.report : null, error, loading };
}

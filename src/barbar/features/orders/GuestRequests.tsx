import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBar } from '../../app/providers/BarProvider';
import type { GuestRequest } from '../../domain/guest-requests';
import { api } from '../../services/api-client';
import { t } from '../../presentation/i18n/runtime';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { Sheet } from '../../ui/sheet';

export function useGuestRequests() {
  const { data, staffData } = useBar();
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let stopped = false;
    const read = async () => {
      try {
        const result = await api('/api/barbar/guest-requests');
        if (!stopped) {
          setRequests(result.requests);
          setError('');
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 10000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [data, staffData, version]);
  return { requests, error, reload };
}
function RequestForm({
  request,
  close,
  reload,
}: {
  request: GuestRequest;
  close: () => void;
  reload: () => void;
}) {
  const { busy, run, notify } = useBar();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(request.lines.map((l) => l.id));
  async function submit(accept: boolean) {
    const ok = await run(
      accept
        ? { type: 'acceptGuestRequest', requestId: request.id, lineIds: selected }
        : { type: 'rejectGuestRequest', requestId: request.id },
      'Заявка обработана.',
    );
    reload();
    if (ok) {
      close();
      if (accept) {
        try {
          const board = await api('/api/barbar/orders');
          const order = board.orders.find((o) => o.tableId === request.tableId);
          if (order) navigate(`/orders/${order.id}`);
        } catch (e) {
          notify((e as Error).message, true);
        }
      }
    }
  }
  return (
    <Sheet
      title="Заявка гостя"
      subtitle={request.tableName}
      close={() => {
        if (!busy) close();
      }}
    >
      <fieldset disabled={busy} className="guest-request-lines">
        {request.lines.map((l) => (
          <label key={l.id}>
            <input
              type="checkbox"
              checked={selected.includes(l.id)}
              onChange={(e) =>
                setSelected((ids) => (e.target.checked ? [...ids, l.id] : ids.filter((id) => id !== l.id)))
              }
            />
            <span>
              {l.name} × {l.quantity}
              {l.servingMl ? ` · ${l.servingMl} ${t('мл')}` : ''}
            </span>
            <strong>{money(l.unitPrice * l.quantity)}</strong>
          </label>
        ))}
        {request.comment && <p>{request.comment}</p>}
        <p className="form-help">{t('Выбранные позиции попадут в чек. Остальные будут отклонены.')}</p>
        <div className="guest-request-actions">
          <button className="button secondary" type="button" onClick={() => void submit(false)}>
            {t('Отклонить заявку')}
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!selected.length}
            onClick={() => void submit(true)}
          >
            {t('Принять выбранное')}
          </button>
        </div>
      </fieldset>
    </Sheet>
  );
}
export function GuestRequests({
  tableId,
  feed,
}: {
  tableId?: string;
  feed: ReturnType<typeof useGuestRequests>;
}) {
  const [selected, setSelected] = useState<GuestRequest | null>(null);
  const requests = feed.requests.filter((r) => !tableId || r.tableId === tableId);
  return (
    <section className="guest-requests" aria-label={t('Заявки гостей')}>
      <h2 aria-live="polite">
        {t('Заявки гостей')} · {requests.length}
      </h2>
      {feed.error && <p role="alert">{t(feed.error)}</p>}
      <div className="guest-request-actions">
        {requests.map((r) => (
          <button type="button" key={r.id} className="button secondary" onClick={() => setSelected(r)}>
            {r.tableName} · {r.lines.length}
          </button>
        ))}
      </div>
      {selected && <RequestForm request={selected} close={() => setSelected(null)} reload={feed.reload} />}
    </section>
  );
}

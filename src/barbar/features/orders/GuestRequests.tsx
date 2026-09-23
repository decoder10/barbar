import { BellRing } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBar } from '../../app/providers/BarProvider';
import { requestsByTable, type GuestRequest } from '../../domain/guest-requests';
import { api } from '../../services/api-client';
import { t } from '../../presentation/i18n/runtime';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { elapsedLabel } from '../../presentation/format-date';
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
/** «Мохито × 2, Пиво × 1»: what a table asked for, in stored product names. */
const itemsText = (requests: GuestRequest[]) =>
  requests
    .flatMap((r) => r.lines)
    .map((l) => `${l.name} × ${l.quantity}`)
    .join(', ');
/** «3 позиций», or «Заявок: 2 · 5 позиций» when a table sent more than one. */
const countText = (requests: GuestRequest[]) => {
  const lines = t(`${requests.reduce((sum, r) => sum + r.lines.length, 0)} позиций`);
  return requests.length > 1 ? `${t('Заявок')}: ${requests.length} · ${lines}` : lines;
};

/**
 * Every pending request of one table, each accepted with its chosen lines into the table's receipt or
 * rejected. The sheet stays open while the table has more; the receipt opens after the last acceptance.
 */
export function GuestRequestSheet({
  requests,
  close,
  reload,
}: {
  requests: GuestRequest[];
  close: () => void;
  reload: () => void;
}) {
  const { busy, run, notify } = useBar();
  const navigate = useNavigate();
  const [table] = useState(() => ({ id: requests[0]?.tableId, name: requests[0]?.tableName || '' }));
  // Handled requests leave at once, before the queue is read again.
  const [handled, setHandled] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const open = requests.filter((r) => !handled.includes(r.id));
  const chosen = (r: GuestRequest) => selected[r.id] ?? r.lines.map((l) => l.id);
  async function submit(request: GuestRequest, accept: boolean) {
    const ok = await run(
      accept
        ? { type: 'acceptGuestRequest', requestId: request.id, lineIds: chosen(request) }
        : { type: 'rejectGuestRequest', requestId: request.id },
      'Заявка обработана.',
    );
    reload();
    if (!ok) return;
    setHandled((ids) => [...ids, request.id]);
    if (open.some((r) => r.id !== request.id)) return;
    close();
    if (accept) {
      try {
        const board = await api('/api/barbar/orders');
        const order = board.orders.find((o) => o.tableId === table.id);
        if (order) navigate(`/orders/${order.id}`);
      } catch (e) {
        notify((e as Error).message, true);
      }
    }
  }
  return (
    <Sheet
      title={`Стол ${table.name}`}
      subtitle={open.length > 1 ? `${t('Заявок')}: ${open.length}` : 'Заявка гостя'}
      close={() => {
        if (!busy) close();
      }}
    >
      {!open.length && <p className="form-help">{t('Заявок больше нет.')}</p>}
      <div className="guest-request-list">
        {open.map((request) => {
          const lineIds = chosen(request);
          const total = request.lines
            .filter((l) => lineIds.includes(l.id))
            .reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
          return (
            <article className="guest-request-card" key={request.id}>
              <header>
                <strong>{t('Заявка гостя')}</strong>
                <small>{t(elapsedLabel(request.createdAt, Date.now()))}</small>
              </header>
              <fieldset disabled={busy} className="guest-request-lines">
                {request.lines.map((l) => (
                  <label key={l.id}>
                    <input
                      type="checkbox"
                      checked={lineIds.includes(l.id)}
                      onChange={(e) =>
                        setSelected((current) => ({
                          ...current,
                          [request.id]: e.target.checked
                            ? [...lineIds, l.id]
                            : lineIds.filter((id) => id !== l.id),
                        }))
                      }
                    />
                    <span>
                      {l.name} × {l.quantity}
                      {l.servingMl ? ` · ${l.servingMl} ${t('мл')}` : ''}
                    </span>
                    <strong>{money(l.unitPrice * l.quantity)}</strong>
                  </label>
                ))}
                {request.comment && (
                  <p className="guest-request-comment">
                    <small>{t('Комментарий гостя')}</small>
                    {request.comment}
                  </p>
                )}
                <p className="guest-request-total">
                  <span>{t('Итого')}</span>
                  <strong>{money(total)}</strong>
                </p>
                <div className="guest-request-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void submit(request, false)}
                  >
                    {t('Отклонить заявку')}
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={!lineIds.length}
                    onClick={() => void submit(request, true)}
                  >
                    {t('Принять выбранное')}
                  </button>
                </div>
              </fieldset>
            </article>
          );
        })}
      </div>
      {open.length > 0 && (
        <p className="form-help">{t('Выбранные позиции попадут в чек. Остальные будут отклонены.')}</p>
      )}
    </Sheet>
  );
}
/** Pending guest requests grouped by table (the board, or one table's receipt); tiles mark them too. */
export function GuestRequests({
  tableId,
  feed,
  open,
}: {
  tableId?: string;
  feed: ReturnType<typeof useGuestRequests>;
  /** Opens the table's requests elsewhere; without it the queue opens its own sheet. */
  open?: (tableId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const requests = feed.requests.filter((r) => !tableId || r.tableId === tableId);
  if (!requests.length && !feed.error) return null;
  const groups = requestsByTable(requests);
  return (
    <section className="guest-requests" aria-label={t('Заявки гостей')}>
      <h2 aria-live="polite">
        <BellRing size={17} aria-hidden="true" />
        {t('Заявки гостей')} · {requests.length}
      </h2>
      {feed.error && <p role="alert">{t(feed.error)}</p>}
      <div className="guest-request-queue">
        {[...groups].map(([id, group]) => (
          <button
            type="button"
            key={id}
            className="guest-request-chip"
            onClick={() => (open || setSelected)(id)}
          >
            <strong>
              {t('Стол')} {group[0].tableName}
            </strong>
            <span>{countText(group)}</span>
            <span className="guest-request-items">{itemsText(group)}</span>
            <small>{t(elapsedLabel(group[0].createdAt, Date.now()))}</small>
          </button>
        ))}
      </div>
      {selected && (
        <GuestRequestSheet
          requests={feed.requests.filter((r) => r.tableId === selected)}
          close={() => setSelected(null)}
          reload={feed.reload}
        />
      )}
    </section>
  );
}

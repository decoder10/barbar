import { ShiftCloseButton } from '../features/orders/ShiftCloseSheet';
import { GuestRequestSheet, GuestRequests, useGuestRequests } from '../features/orders/GuestRequests';
import { requestsByTable as groupRequests } from '../domain/guest-requests';
import { Armchair, BellRing, ChevronRight, QrCode, ReceiptText, Settings2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBar } from '../app/providers/BarProvider';
import { TablesEditor } from '../features/orders/TablesEditor';
import { useOrders } from '../features/orders/use-orders';
import { byId } from '../domain/lookup';
import {
  linesByOrder as groupLines,
  orderBusinessDay,
  orderTotal,
  receiptCount,
  splitOrdersByShift,
} from '../domain/orders';
import type { Order } from '../domain/types';
import { formatMoney as money } from '../presentation/currency/format-money';
import { businessDayShortLabel, elapsedLabel } from '../presentation/format-date';
import { useBusinessToday } from '../features/sales/use-business-date';
import { t } from '../presentation/i18n/runtime';
import { PageHeading } from '../ui/layout';
import { SalesFullscreen } from '../features/sales/SalesFullscreen';
import { LoadingStatus } from '../ui/loading';

/** Ticks on its own, so the board is not re-rendered just to refresh «N мин». */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{t(elapsedLabel(since, now))}</>;
}

/** The tables board: the first screen of a shift for the owner and the worker alike. */
export default function Tables() {
  const { role, busy, run } = useBar();
  const navigate = useNavigate();
  const { tables, orders, sales, loading, error } = useOrders();
  const feed = useGuestRequests();
  // The table whose pending requests are open: all of them, not only the first.
  const [requestTable, setRequestTable] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const linesByOrder = useMemo(() => groupLines(sales), [sales]);
  // The board belongs to the current shift (06:00–05:59 Yerevan): receipts left open from earlier shifts
  // stay in the database, untouched, and the board is clean when the shift day turns.
  const today = useBusinessToday();
  const shift = useMemo(() => splitOrdersByShift(orders, today), [orders, today]);
  // Every open receipt still holds its table: the server allows one open receipt per table, whatever the day.
  const byTable = new Map(orders.filter((o) => o.tableId).map((o) => [o.tableId!, o]));
  const requestsByTable = groupRequests(feed.requests);
  const tableById = byId(tables);
  const active = tables.filter((table) => table.active);
  const walkIns = shift.current.filter((o) => !o.tableId || !tableById.get(o.tableId)?.active);
  // Receipts of earlier shifts are off the board but never out of sight: the strip leads to their page.
  const unpaid = shift.earlier.flatMap((day) => day.orders);
  const unpaidTotal = orderTotal(unpaid.flatMap((o) => linesByOrder.get(o.id) || []));
  // The receipt is created with its first line, so a table someone only glanced at stays free.
  const openAt = (tableId?: string) =>
    navigate(tableId ? `/orders/new?table=${encodeURIComponent(tableId)}` : '/orders/new');
  /** A table tile; a pending guest request adds its own strip below, apart from the receipt. */
  const wrap = (key: string, tableId: string | undefined, name: string, children: ReactNode) => {
    const pending = (tableId && requestsByTable.get(tableId)) || [];
    const lines = pending.reduce((sum, r) => sum + r.lines.length, 0);
    return (
      <div className={`table-tile-wrap${pending.length ? ' has-guest-request' : ''}`} key={key}>
        {children}
        {pending.length > 0 && (
          <button
            type="button"
            className="table-guest-request"
            aria-label={`${t(pending.length > 1 ? 'Заявки гостей' : 'Заявка гостя')} · ${t(name)} · ${t(`${lines} позиций`)}`}
            onClick={() => setRequestTable(tableId!)}
          >
            <BellRing size={16} aria-hidden="true" />
            <span>{t(pending.length > 1 ? 'Заявки гостей' : 'Заявка гостя')}</span>
            <b>
              {pending.length > 1 ? `${pending.length} · ` : ''}
              {t(`${lines} позиций`)}
            </b>
          </button>
        )}
      </div>
    );
  };
  const tile = (order: Order, name: string) => {
    const lines = linesByOrder.get(order.id) || [];
    const count = receiptCount(lines);
    return wrap(
      order.id,
      order.tableId,
      name,
      <>
        <button
          type="button"
          className="table-tile open"
          disabled={busy}
          onClick={() => navigate(`/orders/${order.id}`)}
        >
          <span className="table-name">{t(name)}</span>
          <strong>{t(money(orderTotal(lines)))}</strong>
          <small>
            {t(count ? `${count} позиций` : 'пусто')} · <Elapsed since={order.openedAt} />
          </small>
          {order.openedBy && <small className="table-opener">{t(order.openedBy.fullName)}</small>}
        </button>
        {!lines.length && (
          <button
            type="button"
            className="icon-button table-tile-close"
            disabled={busy}
            aria-label={t(`Закрыть пустой заказ ${name}`)}
            title={t('Закрыть пустой заказ')}
            onClick={() => void run({ type: 'cancelOrder', orderId: order.id }, 'Пустой заказ закрыт.')}
          >
            <X size={15} />
          </button>
        )}
      </>,
    );
  };
  /** A table still held by a receipt of an earlier shift: muted, without the running timer, opens that receipt. */
  const staleTile = (order: Order, name: string) => {
    const lines = linesByOrder.get(order.id) || [];
    const since = `${t('Счёт с')} ${businessDayShortLabel(orderBusinessDay(order))}`;
    return wrap(
      order.id,
      order.tableId,
      name,
      <button
        type="button"
        className="table-tile stale"
        disabled={busy}
        title={t('Незакрытый счёт прошлой смены')}
        onClick={() => navigate(`/orders/${order.id}`)}
      >
        <span className="table-name">{t(name)}</span>
        <small className="table-stale-since">{since}</small>
        <strong>{t(money(orderTotal(lines)))}</strong>
      </button>,
    );
  };
  return (
    <>
      <div className="tables-heading">
        <PageHeading title="Столы">
          <SalesFullscreen home />
          <ShiftCloseButton />
          {role === 'admin' && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Settings2 size={16} />
              {t('Настроить столы')}
            </button>
          )}
          <button type="button" className="button primary" disabled={busy} onClick={() => openAt()}>
            <Zap size={16} />
            {t('Быстрая продажа')}
          </button>
          {/* Last: codes are printed once, the shift's own actions come first on a phone's scrolling row. */}
          <Link className="button secondary" to="/tables/qr" title={t('QR-коды столов')}>
            <QrCode size={16} />
            {t('QR-коды')}
          </Link>
        </PageHeading>
      </div>
      <GuestRequests feed={feed} open={setRequestTable} />
      {error && <p role="alert">{t(error)}</p>}
      {loading && !error ? (
        <LoadingStatus label="Открываем столы…" />
      ) : (
        <>
          {unpaid.length > 0 && (
            <Link className="unpaid-entry" to="/tables/unpaid">
              <ReceiptText size={18} aria-hidden="true" />
              <span>{t('Незакрытые счета прошлых смен')}</span>
              <b>
                {unpaid.length} · {t(money(unpaidTotal))}
              </b>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          )}
          {!active.length && (
            <div className="empty tables-empty">
              <span className="empty-icon">
                <Armchair size={26} />
              </span>
              <h3>{t('Столов пока нет')}</h3>
              <p>
                {t(
                  role === 'admin'
                    ? 'Добавьте столы кнопкой «Настроить столы». Быстрая продажа работает и без них.'
                    : 'Попросите владельца добавить столы. Быстрая продажа работает и без них.',
                )}
              </p>
            </div>
          )}
          <div className="tables-board">
            {active.map((table) => {
              const order = byTable.get(table.id);
              if (order)
                return orderBusinessDay(order) >= today
                  ? tile(order, table.name)
                  : staleTile(order, table.name);
              return wrap(
                table.id,
                table.id,
                table.name,
                <button
                  type="button"
                  className="table-tile free"
                  disabled={busy}
                  onClick={() => openAt(table.id)}
                >
                  <span className="table-name">{t(table.name)}</span>
                  <small>{t('Свободен')}</small>
                </button>,
              );
            })}
          </div>
          {walkIns.length > 0 && (
            <section className="walk-in-orders">
              <h2>{t('Без стола')}</h2>
              <div className="tables-board">
                {walkIns.map((order) => tile(order, tableById.get(order.tableId || '')?.name || 'Без стола'))}
              </div>
            </section>
          )}
        </>
      )}
      {requestTable && (
        <GuestRequestSheet
          requests={requestsByTable.get(requestTable) || []}
          close={() => setRequestTable(null)}
          reload={feed.reload}
        />
      )}
      {editing && <TablesEditor tables={tables} orders={orders} close={() => setEditing(false)} />}
    </>
  );
}

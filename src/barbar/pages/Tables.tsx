import { Armchair, Settings2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBar } from '../app/providers/BarProvider';
import { TablesEditor } from '../features/orders/TablesEditor';
import { useOrders } from '../features/orders/use-orders';
import { byId } from '../domain/lookup';
import { orderLines, orderTotal, receiptCount } from '../domain/orders';
import type { Order } from '../domain/types';
import { formatMoney as money } from '../presentation/currency/format-money';
import { elapsedLabel } from '../presentation/format-date';
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
  const [editing, setEditing] = useState(false);
  const linesByOrder = useMemo(() => {
    const groups = new Map<string, typeof sales>();
    for (const line of orderLines(sales, undefined))
      groups.set(line.orderId!, [...(groups.get(line.orderId!) || []), line]);
    return groups;
  }, [sales]);
  const byTable = new Map(orders.filter((o) => o.tableId).map((o) => [o.tableId!, o]));
  const tableById = byId(tables);
  const active = tables.filter((table) => table.active);
  const walkIns = orders.filter((o) => !o.tableId || !tableById.get(o.tableId)?.active);
  // The receipt is created with its first line, so a table someone only glanced at stays free.
  const openAt = (tableId?: string) =>
    navigate(tableId ? `/orders/new?table=${encodeURIComponent(tableId)}` : '/orders/new');
  const tile = (order: Order, name: string) => {
    const lines = linesByOrder.get(order.id) || [];
    const count = receiptCount(lines);
    return (
      <div className="table-tile-wrap" key={order.id}>
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
      </div>
    );
  };
  return (
    <>
      <div className="tables-heading">
        <PageHeading
          eyebrow="ЗАЛ"
          title="Столы"
          description="Откройте стол, добавьте напитки и примите оплату."
        >
          <SalesFullscreen home />
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
        </PageHeading>
      </div>
      {error && <p role="alert">{t(error)}</p>}
      {loading && !error ? (
        <LoadingStatus label="Открываем столы…" />
      ) : (
        <>
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
              if (order) return tile(order, table.name);
              return (
                <button
                  type="button"
                  key={table.id}
                  className="table-tile free"
                  disabled={busy}
                  onClick={() => openAt(table.id)}
                >
                  <span className="table-name">{t(table.name)}</span>
                  <small>{t('Свободен')}</small>
                </button>
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
      {editing && <TablesEditor tables={tables} orders={orders} close={() => setEditing(false)} />}
    </>
  );
}

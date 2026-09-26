import { ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBar } from '../app/providers/BarProvider';
import { businessDayHint } from '../domain/business-day';
import { byId } from '../domain/lookup';
import { linesByOrder, orderTotal, receiptCount, splitOrdersByShift } from '../domain/orders';
import { useOrders } from '../features/orders/use-orders';
import { useBusinessToday } from '../features/sales/use-business-date';
import { formatMoney as money } from '../presentation/currency/format-money';
import { businessDayLabel } from '../presentation/format-date';
import { locale, t } from '../presentation/i18n/runtime';
import { PageHeading } from '../ui/layout';
import { LoadingStatus } from '../ui/loading';

/** Opening time in bar time (Yerevan); the day is the section the receipt is listed under. */
const openedLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(locale(), {
    timeZone: 'Asia/Yerevan',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Receipts left open by earlier shifts, grouped by shift day, newest first. Nothing here changes a
 * receipt: a tap opens it, and it is paid or cancelled on the order screen as usual.
 */
export default function UnpaidOrders() {
  const { busy } = useBar();
  const navigate = useNavigate();
  const { tables, orders, sales, loading, error } = useOrders();
  const today = useBusinessToday();
  const { earlier } = useMemo(() => splitOrdersByShift(orders, today), [orders, today]);
  const lines = useMemo(() => linesByOrder(sales), [sales]);
  const tableById = byId(tables);
  return (
    <>
      <PageHeading
        eyebrow="ЗАЛ"
        title="Незакрытые счета"
        description="Счета прошлых смен, которые ещё не оплачены. Откройте счёт, чтобы принять оплату или отменить его."
      >
        <Link className="button secondary" to="/">
          <ArrowLeft size={16} />
          {t('Столы')}
        </Link>
      </PageHeading>
      <p className="business-day-hint">{t(businessDayHint)}</p>
      {error && <p role="alert">{t(error)}</p>}
      {loading && !error ? (
        <LoadingStatus label="Открываем счета…" />
      ) : !earlier.length ? (
        <div className="empty">
          <span className="empty-icon">
            <CheckCircle2 size={26} />
          </span>
          <h3>{t('Незакрытых счетов нет')}</h3>
          <p>{t('Все счета прошлых смен оплачены или закрыты.')}</p>
        </div>
      ) : (
        earlier.map(({ businessDay, orders: dayOrders }) => {
          const dayTotal = orderTotal(dayOrders.flatMap((o) => lines.get(o.id) || []));
          return (
            <section className="unpaid-day" key={businessDay} aria-label={businessDayLabel(businessDay)}>
              <header className="unpaid-day-head">
                <h2>{businessDayLabel(businessDay)}</h2>
                <span>
                  {t(`Счетов: ${dayOrders.length}`)} · <strong>{t(money(dayTotal))}</strong>
                </span>
              </header>
              <div className="unpaid-list">
                {dayOrders.map((order) => {
                  const orderLines = lines.get(order.id) || [];
                  const count = receiptCount(orderLines);
                  const name = (order.tableId && tableById.get(order.tableId)?.name) || 'Без стола';
                  return (
                    <button
                      type="button"
                      className="unpaid-card"
                      key={order.id}
                      disabled={busy}
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <span className="unpaid-card-top">
                        <span className="table-name">{t(name)}</span>
                        <strong>{t(money(orderTotal(orderLines)))}</strong>
                      </span>
                      <small>
                        {t(count ? `${count} позиций` : 'пусто')} · {t('открыт в')}{' '}
                        {openedLabel(order.openedAt)}
                      </small>
                      {order.openedBy && <small>{t(order.openedBy.fullName)}</small>}
                      <ChevronRight className="unpaid-card-go" size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

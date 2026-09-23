import { GuestRequests, useGuestRequests } from '../features/orders/GuestRequests';
import { ArrowLeft, CheckCircle2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useBar } from '../app/providers/BarProvider';
import { OrderReceipt, type ReceiptLine } from '../features/orders/OrderReceipt';
import { PaymentSheet } from '../features/orders/PaymentSheet';
import { useOrders } from '../features/orders/use-orders';
import { SaleForm } from '../features/sales/SaleForm';
import { SalesCatalog } from '../features/sales/SalesCatalog';
import { SalesFullscreen } from '../features/sales/SalesFullscreen';
import { StaffSaleForm } from '../features/sales/StaffSaleForm';
import type { CatalogSelection, SaleValue } from '../features/sales/SaleDialog';
import { businessToday } from '../domain/business-day';
import { byId } from '../domain/lookup';
import { openOrderAt, orderLines, orderTotal } from '../domain/orders';
import { formatMoney as money } from '../presentation/currency/format-money';
import { t } from '../presentation/i18n/runtime';
import { BusyButton, LoadingStatus } from '../ui/loading';
import { Modal } from '../ui/modal';

/** «Продажи» hands over the tapped drink as `add=kind:id`; the dialog opens with it on the draft. */
const handedOver = (value: string | null): CatalogSelection | null => {
  const [kind, id] = (value || '').split(':');
  return (kind === 'cocktail' || kind === 'alcohol') && id ? { kind, id } : null;
};

/** One open receipt: the catalog on the left adds lines, the receipt on the right takes the payment. */
export default function OrderPage() {
  const { orderId = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const guestFeed = useGuestRequests();
  const { data, role, run, busy } = useBar();
  const { tables, orders, sales, loading, refreshing, error } = useOrders();
  // `/orders/new` is a draft: the receipt is written with its first line, so nothing empty is left behind.
  const draft = orderId === 'new';
  const draftTableId = draft ? search.get('table') || undefined : undefined;
  const [selected, setSelected] = useState<CatalogSelection | null>(() =>
    draft ? handedOver(search.get('add')) : null,
  );
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [done, setDone] = useState<{ total: number; change: number; tableName: string } | null>(null);
  const order = draft ? undefined : orders.find((o) => o.id === orderId);
  const tableId = order?.tableId || draftTableId;
  const table = tableId ? tables.find((t) => t.id === tableId) : undefined;
  const tableName = table ? `${t('Стол')} ${table.name}` : t('Без стола');
  const lines = orderLines(sales as ReceiptLine[], orderId);
  const total = orderTotal(lines);
  const date = businessToday();
  const cocktailById = useMemo(() => byId(data.cocktails), [data.cocktails]);
  const alcoholById = useMemo(() => byId(data.alcohol), [data.alcohol]);
  /** The draft becomes a real order with its first line; a table that already has one opens that one. */
  const ensureOrder = async () => {
    if (!draft) return orderId;
    const existing = draftTableId ? openOrderAt(orders, draftTableId) : undefined;
    const created =
      existing ||
      (await run({ type: 'openOrder', ...(draftTableId ? { tableId: draftTableId } : {}) }, 'Заказ открыт.'));
    if (!created) return null;
    navigate(`/orders/${created.id}`, { replace: true });
    return created.id;
  };
  const addLine = async (value: SaleValue) => {
    const id = await ensureOrder();
    return (
      !!id &&
      (await run(
        { type: 'sale', value: { ...value, date, businessDay: true, orderId: id } },
        'Добавлено в заказ.',
      ))
    );
  };
  if (done)
    return (
      <div className="order-done">
        <span className="order-done-icon">
          <CheckCircle2 size={34} />
        </span>
        <h1>{t('Оплачено')}</h1>
        <p className="order-done-total">{t(money(done.total))}</p>
        {done.change > 0 && (
          <p className="order-done-change">
            {t('Сдача')} <strong>{t(money(done.change))}</strong>
          </p>
        )}
        <p className="order-done-table">{t(done.tableName)}</p>
        <div className="order-done-actions">
          <Link className="button primary" to="/">
            <ArrowLeft size={16} /> {t('К столам')}
          </Link>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setDone(null);
              navigate('/orders/new');
            }}
          >
            <Zap size={16} /> {t('Новый заказ')}
          </button>
        </div>
      </div>
    );
  if (loading && !error) return <LoadingStatus label="Открываем заказ…" />;
  // A receipt created a moment ago is listed once the board refreshes; only a settled miss is a closed order.
  if (!order && !draft && !refreshing)
    return (
      <div className="empty order-missing">
        <h3>{t('Заказ закрыт или не найден')}</h3>
        <p>{t(error || 'Возможно, его уже оплатили или отменили на другом устройстве.')}</p>
        <Link className="button secondary" to="/">
          <ArrowLeft size={16} /> {t('К столам')}
        </Link>
      </div>
    );
  const ownerProduct =
    selected && role === 'admin'
      ? selected.kind === 'cocktail'
        ? cocktailById.get(selected.id)
        : alcoholById.get(selected.id)
      : undefined;
  return (
    <>
      <div className="order-heading">
        <Link className="button secondary back-to-tables" to="/">
          <ArrowLeft size={16} /> {t('Столы')}
        </Link>
        <div>
          <div className="eyebrow">{t('ОТКРЫТЫЙ ЗАКАЗ')}</div>
          <h1>{t(tableName)}</h1>
        </div>
        <SalesFullscreen home />
      </div>
      {/* Above the catalog: a table's pending requests must be seen, not found below the drinks. */}
      {tableId && <GuestRequests tableId={tableId} feed={guestFeed} />}
      <div className="sales-layout">
        <SalesCatalog date={date} filterKey="order" heading={false} onSelect={setSelected} />
        <OrderReceipt
          order={order}
          tableName={tableName}
          lines={lines}
          total={total}
          onAdd={(group) =>
            void addLine({
              kind: group.kind,
              productId: group.latest.productId,
              quantity: group.kind === 'cocktail' ? 1 : group.latest.quantity,
              ...(group.latest.servingMl ? { servingMl: group.latest.servingMl } : {}),
            })
          }
          onRemove={(group) =>
            void run({ type: 'removeLine', saleId: group.latest.id }, 'Позиция убрана из заказа.')
          }
          onPay={() => setPaying(true)}
          onCancel={() => {
            if (draft) navigate('/');
            else if (!lines.length)
              void run({ type: 'cancelOrder', orderId }, 'Заказ закрыт.').then((ok) => ok && navigate('/'));
            else setCancelling(true);
          }}
        />
      </div>
      {selected && ownerProduct && (
        <SaleForm
          kind={selected.kind}
          product={ownerProduct}
          date={date}
          close={() => setSelected(null)}
          onSubmit={addLine}
        />
      )}
      {selected && role === 'barbar' && (
        <StaffSaleForm selection={selected} date={date} close={() => setSelected(null)} onSubmit={addLine} />
      )}
      {paying && order && (
        <PaymentSheet
          order={order}
          total={total}
          close={() => setPaying(false)}
          onPaid={(result) => {
            setPaying(false);
            setDone({ ...result, tableName });
          }}
        />
      )}
      {cancelling && (
        <Modal
          title="Отменить заказ?"
          subtitle={`${tableName} · ${money(total)}`}
          close={() => setCancelling(false)}
        >
          <p className="modal-text">
            {t(
              'Все позиции вернутся на склад, стол освободится. Записи останутся в истории с отметкой об отмене.',
            )}
          </p>
          <BusyButton
            type="button"
            className="button primary full"
            busy={busy}
            onClick={async () => {
              if (await run({ type: 'cancelOrder', orderId }, 'Заказ отменён. Остатки возвращены.')) {
                setCancelling(false);
                navigate('/');
              }
            }}
          >
            {t('Подтвердить отмену')}
          </BusyButton>
        </Modal>
      )}
    </>
  );
}

import { CreditCard, Minus, Plus, ReceiptText, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { groupReceipt, receiptCount, type ReceiptGroup } from '../../domain/orders';
import type { Order, Sale, StaffSale } from '../../domain/types';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { businessTimeLabel } from '../../presentation/format-date';
import { t } from '../../presentation/i18n/runtime';
import { Empty } from '../../ui/layout';
import { Sheet } from '../../ui/sheet';
import { useCompact } from '../../ui/use-compact';
import { staffSaleLabel } from '../sales/StaffSaleForm';

export type ReceiptLine = Sale | StaffSale;

/**
 * The receipt of one open order, identical for both roles: grouped lines with «−»/«+», the total
 * and the pay button. A sticky panel beside the catalog; on phones a bar that opens a sheet.
 */
export function OrderReceipt({
  order,
  tableName,
  lines,
  total,
  onAdd,
  onRemove,
  onPay,
  onCancel,
}: {
  /** Absent for a draft: the receipt is created with its first line. */
  order?: Order;
  tableName: string;
  lines: ReceiptLine[];
  total: number;
  /** One more of the same line (same product, same serving). */
  onAdd: (group: ReceiptGroup<ReceiptLine>) => void;
  /** Takes the most recently added sale of the group off the receipt. */
  onRemove: (group: ReceiptGroup<ReceiptLine>) => void;
  onPay: () => void;
  onCancel: () => void;
}) {
  const { busy } = useBar();
  const compact = useCompact();
  const [open, setOpen] = useState(false);
  const groups = groupReceipt(lines);
  const count = receiptCount(lines);
  const opened = order
    ? `${businessTimeLabel(order.openedAt)}${order.openedBy ? ` · ${order.openedBy.fullName}` : ''}`
    : 'Заказ появится с первой позицией';
  const body = (
    <>
      <div className="receipt-lines order-lines">
        {!groups.length ? (
          <Empty title={t('Заказ пуст')} text="Коснитесь напитка в каталоге — он появится в чеке." />
        ) : (
          groups.map((group) => (
            <div className="receipt-line" key={group.key}>
              <div>
                <strong>{t(group.name)}</strong>
                <small>
                  {t(staffSaleLabel(group.quantity, group))}
                  {t(group.servingMl ? ` · по ${group.servingMl} мл` : '')}
                </small>
              </div>
              <b>{t(money(group.revenue))}</b>
              <span className="line-stepper">
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label={t(`Убрать ${group.name}`)}
                  onClick={() => onRemove(group)}
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label={t(`Добавить ещё ${group.name}`)}
                  onClick={() => onAdd(group)}
                >
                  <Plus size={15} />
                </button>
              </span>
            </div>
          ))
        )}
      </div>
      <div className="receipt-total">
        <span>
          {t('Итого')}
          <strong>{t(money(total))}</strong>
        </span>
        <small>{t(opened)}</small>
      </div>
      <button
        type="button"
        className="button primary full pay-button"
        disabled={busy || !groups.length}
        onClick={() => {
          setOpen(false);
          onPay();
        }}
      >
        <CreditCard size={18} />
        {t('Оплатить')} {groups.length ? money(total) : ''}
      </button>
      <button
        type="button"
        className="button secondary full cancel-order"
        disabled={busy}
        onClick={() => {
          setOpen(false);
          onCancel();
        }}
      >
        <XCircle size={16} />
        {t(groups.length ? 'Отменить заказ' : 'Закрыть пустой заказ')}
      </button>
      <div className="receipt-note">
        <span />
        {t(' Остатки списаны при добавлении')}
      </div>
    </>
  );
  if (!compact)
    return (
      <aside className="day-receipt order-panel" aria-label={t('Чек заказа')}>
        <div className="receipt-heading">
          <span className="receipt-icon">
            <ReceiptText size={20} />
          </span>
          <div>
            <h2>{t(tableName)}</h2>
            <p>{t(opened)}</p>
          </div>
          <span className="count-badge">{t(count)}</span>
        </div>
        {body}
      </aside>
    );
  return (
    <>
      <button
        type="button"
        className="day-receipt-bar order-bar"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="receipt-icon">
          <ReceiptText size={19} />
        </span>
        <span>
          {t(tableName)}
          <small>{t(groups.length ? `${count} ${t('позиций')} · ${t('открыть чек')}` : 'Заказ пуст')}</small>
        </span>
        <span className="count-badge">{t(count)}</span>
        <strong>{t(money(total))}</strong>
      </button>
      {open && (
        <Sheet title={tableName} subtitle={opened} close={() => setOpen(false)}>
          <div className="day-receipt order-panel" aria-label={t('Чек заказа')}>
            {body}
          </div>
        </Sheet>
      )}
    </>
  );
}

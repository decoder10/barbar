import { Banknote, Check, Minus, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import {
  cashQuickAmounts,
  changeDue,
  maxSplitParts,
  paymentMethod,
  paymentMethods,
  paymentsTotal,
  splitEvenly,
} from '../../domain/orders';
import { round } from '../../domain/model';
import type { Order } from '../../domain/types';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { currentLanguage, t } from '../../presentation/i18n/runtime';
import { Field } from '../../ui/fields';
import { BusyButton } from '../../ui/loading';
import { Sheet } from '../../ui/sheet';

interface Part {
  method: string;
  amount: string;
  received: string;
}
const methodLabel = (id: string) => paymentMethod(id)?.label[currentLanguage()] || id;
const parse = (value: string) => {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? round(n) : NaN;
};

/**
 * Payment of one receipt: the total large, one method per tap, cash received with the change,
 * or a split between guests. Nothing is written until every part adds up to the total.
 */
export function PaymentSheet({
  order,
  total,
  close,
  onPaid,
}: {
  order: Order;
  total: number;
  close: () => void;
  onPaid: (result: { total: number; change: number }) => void;
}) {
  const { run, busy } = useBar();
  const [parts, setParts] = useState<Part[]>([
    { method: paymentMethods[0].id, amount: String(total), received: '' },
  ]);
  const split = parts.length > 1;
  const update = (index: number, patch: Partial<Part>) =>
    setParts((current) => current.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  const resize = (count: number) => {
    const amounts = splitEvenly(total, count);
    setParts((current) =>
      amounts.map((amount, i) => ({
        method: current[i]?.method || paymentMethods[0].id,
        amount: String(amount),
        received: '',
      })),
    );
  };
  const payments = parts.map((part) => {
    const amount = parse(part.amount);
    const cashLike = !!paymentMethod(part.method)?.change;
    const received = cashLike && part.received.trim() ? parse(part.received) : undefined;
    return { method: part.method, amount, received, cashLike };
  });
  const valid = payments.every(
    (p) =>
      p.amount > 0 && (p.received === undefined || (Number.isFinite(p.received) && p.received >= p.amount)),
  );
  const paid = valid ? paymentsTotal(payments) : 0;
  const remaining = round(total - paid);
  const change = payments.reduce(
    (sum, p) =>
      sum + (p.received === undefined ? 0 : changeDue({ amount: p.amount, receivedCash: p.received })),
    0,
  );
  const balanced = Math.abs(remaining) < 0.005;
  const ready = valid && balanced;
  return (
    <Sheet title="Оплата" subtitle={`Заказ · ${money(total)}`} close={close}>
      <div className="payment-sheet">
        <div className="payment-total">
          <span>{t('К оплате')}</span>
          <strong>{t(money(total))}</strong>
        </div>
        <div className="payment-split-toggle">
          <button
            type="button"
            className={`button ${split ? 'secondary' : 'primary'}`}
            onClick={() => resize(1)}
            aria-pressed={!split}
          >
            <Banknote size={16} /> {t('Один платёж')}
          </button>
          <button
            type="button"
            className={`button ${split ? 'primary' : 'secondary'}`}
            onClick={() => resize(Math.max(2, parts.length))}
            aria-pressed={split}
          >
            <Users size={16} /> {t('Разделить')}
          </button>
        </div>
        {split && (
          <div className="payment-parts-count">
            <span>{t('Гостей')}</span>
            <button
              type="button"
              className="icon-button"
              aria-label={t('Меньше гостей')}
              disabled={parts.length <= 2}
              onClick={() => resize(parts.length - 1)}
            >
              <Minus size={16} />
            </button>
            <strong>{parts.length}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label={t('Больше гостей')}
              disabled={parts.length >= maxSplitParts}
              onClick={() => resize(parts.length + 1)}
            >
              <Plus size={16} />
            </button>
          </div>
        )}
        {parts.map((part, index) => {
          const payment = payments[index];
          return (
            <div className="payment-part" key={index}>
              {split && (
                <div className="payment-part-heading">
                  <span>
                    {t('Гость')} {index + 1}
                  </span>
                  <Field label={`Сумма гостя ${index + 1}, ֏`}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step={1}
                      value={part.amount}
                      onChange={(e) => update(index, { amount: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              <div className="payment-methods" role="group" aria-label={t('Способ оплаты')}>
                {paymentMethods.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={m.id === part.method ? 'selected' : ''}
                    aria-pressed={m.id === part.method}
                    onClick={() => update(index, { method: m.id, received: '' })}
                  >
                    {m.id === part.method && <Check size={15} />}
                    {methodLabel(m.id)}
                  </button>
                ))}
              </div>
              {payment.cashLike && (
                <div className="payment-cash">
                  <Field label="Получено наличными, ֏" hint="Пусто — без сдачи">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder={String(payment.amount || '')}
                      value={part.received}
                      onChange={(e) => update(index, { received: e.target.value })}
                    />
                  </Field>
                  <div className="quick-values">
                    {cashQuickAmounts
                      .filter((n) => n >= (payment.amount || 0))
                      .slice(0, 4)
                      .map((n) => (
                        <button
                          type="button"
                          key={n}
                          className={parse(part.received) === n ? 'selected' : ''}
                          onClick={() => update(index, { received: String(n) })}
                        >
                          {t(money(n))}
                        </button>
                      ))}
                  </div>
                  {payment.received !== undefined && payment.received >= payment.amount && (
                    <p className="payment-change">
                      {t('Сдача')}
                      <strong>
                        {t(money(changeDue({ amount: payment.amount, receivedCash: payment.received })))}
                      </strong>
                    </p>
                  )}
                  {payment.received !== undefined && payment.received < payment.amount && (
                    <p className="form-warning">{t('Получено меньше суммы оплаты.')}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {split && (
          <p className={`payment-remaining ${balanced ? 'done' : ''}`}>
            {balanced
              ? t('Суммы сходятся')
              : remaining > 0
                ? `${t('Осталось распределить')}: ${money(remaining)}`
                : `${t('Лишнее')}: ${money(-remaining)}`}
          </p>
        )}
        <BusyButton
          type="button"
          className="button primary full payment-submit"
          busy={busy}
          busyLabel="Сохраняем…"
          disabled={!ready || busy}
          onClick={async () => {
            if (
              await run(
                {
                  type: 'payOrder',
                  orderId: order.id,
                  expectedTotal: total,
                  payments: payments.map((p) => ({
                    method: p.method,
                    amount: p.amount,
                    ...(p.received !== undefined ? { receivedCash: p.received } : {}),
                  })),
                },
                'Заказ оплачен.',
              )
            )
              onPaid({ total, change });
          }}
        >
          <Check size={18} />
          {t('Оплачено')} · {t(money(total))}
          {change > 0 ? ` · ${t('сдача')} ${money(change)}` : ''}
        </BusyButton>
        <p className="payment-methods-summary">
          {payments.map((p) => `${methodLabel(p.method)} ${money(p.amount || 0)}`).join(' · ')}
        </p>
      </div>
    </Sheet>
  );
}

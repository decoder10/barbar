import { useEffect, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { snapshotRead } from '../../services/api-client';
import { t, currentLanguage } from '../../presentation/i18n/runtime';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { paymentMethods } from '../../domain/orders';
import { toCsv } from '../../domain/reports/csv';
import { download } from '../../ui/export';
import type { Shift } from '../../domain/types';
import type { paidOrderTotals } from '../../domain/shifts';

export function ShiftReport({ from, to }: { from: string; to: string }) {
  const { data } = useBar();
  const [result, setResult] = useState<{
    totals: ReturnType<typeof paidOrderTotals>;
    shifts: Shift[];
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setResult(null);
    setError('');
    void snapshotRead(data, `/api/barbar/shifts?from=${from}&to=${to}`)
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [data, from, to]);
  return (
    <section className="panel">
      <div className="section-title">
        <h2>{t('Чеки и смены')}</h2>
        <button
          type="button"
          className="button secondary"
          disabled={!result}
          onClick={() => {
            if (!result) return;
            download(
              `barbar-shifts-${from}-${to}.csv`,
              toCsv([
                [
                  'День смены',
                  'Оплаченных чеков',
                  'Выручка AMD',
                  ...paymentMethods.map((m) => m.label.ru + ' AMD'),
                  'Пересчитано AMD',
                  'Расхождение AMD',
                ],
                ...result.shifts.map((s) => [
                  s.businessDay,
                  s.count,
                  s.revenue,
                  ...paymentMethods.map((m) => s.payments[m.id] || 0),
                  s.countedCash,
                  s.difference,
                ]),
                [
                  'Итого оплачено за период',
                  result.totals.count,
                  result.totals.revenue,
                  ...paymentMethods.map((m) => result.totals.payments[m.id] || 0),
                ],
                ['Средний чек AMD', result.totals.average],
              ]),
              true,
            );
          }}
        >
          {t('Скачать CSV смен')}
        </button>
      </div>
      <p className="muted">
        {t('Чеки учитываются по дню открытия. Продажи без заказа не входят в средний чек.')}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {result && (
        <>
          <p>
            {t('Оплаченных чеков')}: {result.totals.count} · {t('Средний чек')}:{' '}
            {money(result.totals.average)}
          </p>
          <div className="guest-request-actions">
            {paymentMethods.map((m) => (
              <span key={m.id}>
                {m.label[currentLanguage()]}: {money(result.totals.payments[m.id] || 0)}
              </span>
            ))}
          </div>
          <div className="shift-history">
            <table>
              <thead>
                <tr>
                  {['День смены', 'Оплаченных чеков', 'Выручка', 'Расхождение'].map((label) => (
                    <th key={label}>{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.shifts.map((s) => (
                  <tr key={s.id}>
                    <td>{s.businessDay}</td>
                    <td>{s.count}</td>
                    <td>{money(s.revenue)}</td>
                    <td>{money(s.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

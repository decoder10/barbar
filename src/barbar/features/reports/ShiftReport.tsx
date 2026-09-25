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
    <section className="panel shift-report">
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
      <p className="muted shift-report-hint">
        {t('Чеки учитываются по дню открытия. Продажи без заказа не входят в средний чек.')}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {!result && !error && <p className="muted shift-report-hint">{t('Загружаем смены…')}</p>}
      {result && (
        <>
          <dl className="shift-report-totals">
            <div>
              <dt>{t('Оплаченных чеков')}</dt>
              <dd>{result.totals.count}</dd>
            </div>
            <div>
              <dt>{t('Средний чек')}</dt>
              <dd>{money(result.totals.average)}</dd>
              <dd className="shift-report-note">{t('Без продаж без заказа')}</dd>
            </div>
            <div>
              <dt>{t('Выручка по чекам')}</dt>
              <dd>{money(result.totals.revenue)}</dd>
            </div>
          </dl>
          <h3 className="shift-report-subtitle">{t('Способы оплаты')}</h3>
          <ul className="shift-report-payments">
            {paymentMethods.map((m) => {
              const amount = result.totals.payments[m.id] || 0;
              return (
                <li key={m.id} className={amount ? undefined : 'is-empty'}>
                  <span>{m.label[currentLanguage()]}</span>
                  <strong>{money(amount)}</strong>
                </li>
              );
            })}
          </ul>
          <h3 className="shift-report-subtitle">{t('Смены за период')}</h3>
          {result.shifts.length ? (
            <div className="table-scroll">
              <table className="data-table shift-report-table" aria-label={t('Смены за период')}>
                <thead>
                  <tr>
                    <th>{t('День смены')}</th>
                    {['Оплаченных чеков', 'Выручка', 'Пересчитано', 'Расхождение'].map((label) => (
                      <th key={label} className="num">
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.shifts.map((s) => {
                    const d = s.difference;
                    const [tone, note] =
                      d > 0
                        ? ['is-surplus', t('Излишек')]
                        : d < 0
                          ? ['is-shortage', t('Недостача')]
                          : ['is-even', t('Сходится')];
                    return (
                      <tr key={s.id}>
                        <td>{s.businessDay}</td>
                        <td className="num">{s.count}</td>
                        <td className="num">{money(s.revenue)}</td>
                        <td className="num">{money(s.countedCash)}</td>
                        <td className={`num shift-difference ${tone}`}>
                          <strong>
                            {d > 0 ? '+' : ''}
                            {money(d)}
                          </strong>
                          <small>{note}</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted shift-report-hint">{t('Смен за период нет')}</p>
          )}
        </>
      )}
    </section>
  );
}

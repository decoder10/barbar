import { useServerReport } from './use-server-report';
import { useMemo } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { purchaseForecast, operatingResult } from '../../domain/reports/purchasing';
import { businessToday } from '../../domain/business-day';
import { unitLabel } from '../../domain/model';
import { Field } from '../../ui/fields';
import { useSessionFilter } from '../../presentation/use-session-filter';
import { formatMoney } from '../../presentation/currency/format-money';
import { t } from '../../presentation/i18n/runtime';
export function Purchasing({ from, to }: { from: string; to: string }) {
  const { data } = useBar();
  const [lead, setLead] = useSessionFilter<number>('lead-days', 3);
  const [reserve, setReserve] = useSessionFilter<number>('reserve-days', 4);
  const end = to > businessToday() ? businessToday() : to;
  const remote = useServerReport(from, end, lead, reserve);
  const localRows = useMemo(
    () => purchaseForecast(data, from, end, lead, reserve),
    [data, from, end, lead, reserve],
  );
  const localTotals = useMemo(() => operatingResult(data, from, end), [data, from, end]);
  const rows = remote.report?.forecast || localRows;
  const financial = remote.report;
  const revenue = financial?.groups.reduce((s, r) => s + (r.revenue || 0), 0) || 0;
  const cost = financial?.groups.reduce((s, r) => s + (r.cost || 0), 0) || 0;
  const totals = financial
    ? {
        expenses: financial.expenses,
        losses: financial.losses,
        result: revenue - cost - financial.expenses - financial.losses,
      }
    : localTotals;
  if (data.opening && !remote.report)
    return (
      <section className="panel">
        <h2>{t('Прогноз закупок')}</h2>
        <p role={remote.error ? 'alert' : 'status'}>{t(remote.error || 'Рассчитываем отчёт…')}</p>
      </section>
    );
  return (
    <>
      <section className="panel">
        <h2>{t('Операционный результат')}</h2>
        <div className="form-grid">
          <div>
            <small>{t('Расходы бара')}</small>
            <h3>{formatMoney(totals.expenses)}</h3>
          </div>
          <div>
            <small>{t('Списания и недостачи')}</small>
            <h3>{formatMoney(totals.losses)}</h3>
          </div>
          <div>
            <small>{t('После себестоимости и расходов')}</small>
            <h3>{formatMoney(totals.result)}</h3>
          </div>
        </div>
        <p className="muted">
          {t(
            'Предварительный результат: выручка минус себестоимость продаж, списания и внесённые расходы. Полнота зависит от заполненных закупочных цен и расходов. Закупки повторно не вычитаются.',
          )}
        </p>
      </section>
      <section className="panel">
        <h2>{t('Прогноз закупок')}</h2>
        {remote.error && <p role="alert">{t(remote.error)}</p>}
        <p className="muted">
          {t(
            'По среднему расходу за рабочие дни, когда позиция была в наличии. Рабочий день — день хотя бы с одной продажей. Остаток — текущий. Сезонность и мероприятия не учитываются.',
          )}
        </p>
        <div className="form-grid">
          <Field label="Срок поставки, дней">
            <input
              type="number"
              min="0"
              max="90"
              value={lead}
              onChange={(e) => setLead(Math.min(90, Math.max(0, Number(e.target.value))))}
            />
          </Field>
          <Field label="Резерв, дней">
            <input
              type="number"
              min="0"
              max="90"
              value={reserve}
              onChange={(e) => setReserve(Math.min(90, Math.max(0, Number(e.target.value))))}
            />
          </Field>
        </div>
        <div className="table-scroll">
          <table className="data-table operations-table">
            <thead>
              <tr>
                <th>{t('Позиция')}</th>
                <th>{t('Средний расход / день')}</th>
                <th>{t('Дней без остатка')}</th>
                <th>{t('Хватит на дней')}</th>
                <th>{t('Пополнить')}</th>
                <th>{t('Рекомендация')}</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.consumed > 0)
                .map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>
                      {r.daily.toFixed(2)} {unitLabel(r.unit)}
                    </td>
                    <td>{r.workedDays === null ? '—' : `${r.stockoutDays} / ${r.workedDays}`}</td>
                    <td>{r.daysLeft?.toFixed(1) ?? '—'}</td>
                    <td>
                      {r.suggested} {unitLabel(r.unit)}
                    </td>
                    <td>
                      {t(
                        r.insufficientHistory
                          ? 'Мало истории — проверьте вручную'
                          : r.suggested > 0
                            ? r.preparation
                              ? 'Приготовить партию'
                              : 'Запланировать закупку'
                            : 'Запаса достаточно',
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!rows.some((r) => r.consumed > 0) && <p>{t('Недостаточно данных о расходе за этот период.')}</p>}
        </div>
      </section>
    </>
  );
}

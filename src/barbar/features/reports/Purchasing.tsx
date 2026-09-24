import { useServerReport } from './use-server-report';
import { Fragment, useMemo, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { purchaseForecast, operatingResult } from '../../domain/reports/purchasing';
import { businessToday } from '../../domain/business-day';
import { unitLabel } from '../../domain/model';
import { explainForecast, sourceLabel } from '../../domain/reports/forecast-explanation';
import { PurchaseSettings } from './PurchaseSettings';
import { Field } from '../../ui/fields';
import { useSessionFilter } from '../../presentation/use-session-filter';
import { formatMoney } from '../../presentation/currency/format-money';
import { t } from '../../presentation/i18n/runtime';
export function Purchasing({ from, to }: { from: string; to: string }) {
  const { data } = useBar();
  const [lead, setLead] = useSessionFilter<number>('lead-days', 3);
  const [reserve, setReserve] = useSessionFilter<number>('reserve-days', 4);
  const [settings, setSettings] = useState(false);
  const end = to > businessToday() ? businessToday() : to;
  const remote = useServerReport(from, end, lead, reserve);
  const localRows = useMemo(
    () => purchaseForecast(data, from, end, lead, reserve),
    [data, from, end, lead, reserve],
  );
  const localTotals = useMemo(() => operatingResult(data, from, end), [data, from, end]);
  const rows = remote.report?.forecast || localRows;
  const serverSuppliers = remote.report?.suppliers;
  const suppliers = useMemo(() => serverSuppliers || data.suppliers || [], [serverSuppliers, data.suppliers]);
  // Rows with use, grouped by supplier; items without one come last.
  const groups = useMemo(() => {
    const used = rows.filter((r) => r.consumed > 0);
    const names = new Map(suppliers.map((x) => [x.id, x.name]));
    const map = new Map<string, typeof used>();
    for (const row of used) {
      const key = row.supplierId && names.has(row.supplierId) ? row.supplierId : '';
      map.set(key, [...(map.get(key) || []), row]);
    }
    return [...map]
      .sort(([a], [b]) =>
        a === '' ? 1 : b === '' ? -1 : (names.get(a) || '').localeCompare(names.get(b) || ''),
      )
      .map(([id, list]) => ({ id, name: id ? names.get(id)! : 'Без поставщика', rows: list }));
  }, [rows, suppliers]);
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
        <div className="purchasing-actions">
          <button type="button" className="button secondary" onClick={() => setSettings(true)}>
            {t('Параметры закупок')}
          </button>
        </div>
        <div className="form-grid">
          <Field
            label="Срок поставки по умолчанию, дней"
            hint="Действует, если срок не задан ни у позиции, ни у поставщика"
          >
            <input
              type="number"
              min="0"
              max="90"
              value={lead}
              onChange={(e) => setLead(Math.min(90, Math.max(0, Number(e.target.value))))}
            />
          </Field>
          <Field label="Страховые дни по умолчанию" hint="Действуют, если у позиции они не заданы">
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
          <table className="data-table operations-table purchasing-table">
            <thead>
              <tr>
                <th>{t('Позиция')}</th>
                <th>{t('Средний расход / день')}</th>
                <th>{t('Срок поставки')}</th>
                <th>{t('Страховой запас')}</th>
                <th>{t('Дней без остатка')}</th>
                <th>{t('Хватит на дней')}</th>
                <th>{t('Пополнить')}</th>
                <th>{t('Рекомендация')}</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.id || 'none'}>
                <tr className="purchasing-group">
                  <th colSpan={8} scope="colgroup">
                    {group.id ? group.name : t(group.name)}
                  </th>
                </tr>
                {group.rows.map((r) => {
                  const unit = t(unitLabel(r.unit));
                  const explanation = explainForecast(r, unit);
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td>{r.name}</td>
                        <td>
                          {r.daily.toFixed(2)} {unit}
                        </td>
                        <td>
                          {r.leadDays} {t('дн.')}
                          <small>{t(sourceLabel[r.leadSource])}</small>
                        </td>
                        <td>
                          {r.safetyDays} {t('дн.')}
                          {r.safetyStock > 0 && ` + ${r.safetyStock} ${unit}`}
                          <small>{t(sourceLabel[r.safetySource])}</small>
                        </td>
                        <td>{r.workedDays === null ? '—' : `${r.stockoutDays} / ${r.workedDays}`}</td>
                        <td>{r.daysLeft?.toFixed(1) ?? '—'}</td>
                        <td>
                          {r.suggested} {unit}
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
                      <tr className="purchasing-explanation">
                        <td colSpan={8}>
                          <details>
                            <summary>{t('Как посчитано')}</summary>
                            <p className="purchasing-formula">{explanation.formula}</p>
                            <dl>
                              {explanation.facts.map((fact) => (
                                <div key={fact.label}>
                                  <dt>{t(fact.label)}</dt>
                                  <dd>{t(fact.value)}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            ))}
          </table>
          {!groups.length && <p>{t('Недостаточно данных о расходе за этот период.')}</p>}
        </div>
      </section>
      {settings && <PurchaseSettings suppliers={suppliers} close={() => setSettings(false)} />}
    </>
  );
}

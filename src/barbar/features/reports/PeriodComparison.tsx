import { useEffect, useMemo, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { businessToday } from '../../domain/business-day';
import { categoryLabel } from '../../domain/model';
import {
  basePeriod,
  compare,
  periodFromSales,
  type BaseKind,
  type CompareRow,
  type Comparison,
  type Totals,
} from '../../domain/reports/compare';
import { snapshotRead } from '../../services/api-client';
import { formatMoney } from '../../presentation/currency/format-money';
import { locale, t } from '../../presentation/i18n/runtime';
import { useSessionFilter } from '../../presentation/use-session-filter';
import { Field } from '../../ui/fields';
import { LoadingStatus } from '../../ui/loading';

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatMoney(n)}`;
const percent = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n}%`);
const quantity = (n: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(n);
/** Monday 2026-09-14 is a fixed reference: the weekday number 1–7 names the day in the interface language. */
const weekday = (n: string) => {
  const name = new Date(`2026-09-${13 + Number(n)}T12:00:00Z`).toLocaleDateString(locale(), {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return name.charAt(0).toLocaleUpperCase(locale()) + name.slice(1);
};

function useComparison(current: { from: string; to: string }, base: { from: string; to: string }) {
  const { data } = useBar();
  const remote = !!data.opening;
  const key = `${current.from}:${current.to}:${base.from}:${base.to}`;
  const [state, setState] = useState<{ key: string; value?: Comparison; error?: string } | null>(null);
  useEffect(() => {
    if (!remote) return;
    let active = true;
    const params = new URLSearchParams({
      from: current.from,
      to: current.to,
      baseFrom: base.from,
      baseTo: base.to,
    });
    void snapshotRead(data, `/api/barbar/report/compare?${params}`)
      .then((result) => active && setState({ key, value: result.comparison }))
      .catch(
        (error) => active && setState({ key, error: error instanceof Error ? error.message : 'Ошибка' }),
      );
    return () => {
      active = false;
    };
  }, [data, remote, key, current.from, current.to, base.from, base.to]);
  const local = useMemo(
    () =>
      remote
        ? undefined
        : compare(
            periodFromSales(data.sales, current.from, current.to),
            periodFromSales(data.sales, base.from, base.to),
          ),
    [remote, data.sales, current.from, current.to, base.from, base.to],
  );
  if (!remote) return { value: local, error: '', loading: false };
  return {
    value: state?.key === key ? state.value : undefined,
    error: state?.key === key ? state.error || '' : '',
    loading: state?.key !== key,
  };
}

function TotalsTable({ current, base }: { current: Totals; base: Totals }) {
  const rows: [string, string, string, string][] = [
    [
      'Выручка',
      formatMoney(current.revenue),
      formatMoney(base.revenue),
      signed(current.revenue - base.revenue),
    ],
    ['Себестоимость', formatMoney(current.cost), formatMoney(base.cost), signed(current.cost - base.cost)],
    [
      'Валовая прибыль',
      formatMoney(current.profit),
      formatMoney(base.profit),
      signed(current.profit - base.profit),
    ],
    ['Порции', quantity(current.units), quantity(base.units), quantity(current.units - base.units)],
    [
      'Рабочих дней',
      String(current.workedDays),
      String(base.workedDays),
      String(current.workedDays - base.workedDays),
    ],
    [
      'Выручка за рабочий день',
      formatMoney(current.revenuePerDay),
      formatMoney(base.revenuePerDay),
      signed(current.revenuePerDay - base.revenuePerDay),
    ],
  ];
  return (
    <div className="table-scroll">
      <table className="data-table comparison-table" aria-label={t('Итоги двух периодов')}>
        <thead>
          <tr>
            <th>{t('Показатель')}</th>
            <th>{t('Текущий период')}</th>
            <th>{t('База')}</th>
            <th>{t('Изменение')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, now, before, delta]) => (
            <tr key={label}>
              <td>{t(label)}</td>
              <td>{now}</td>
              <td>{before}</td>
              <td>{delta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DimensionTable({
  title,
  rows,
  label,
  perDay,
}: {
  title: string;
  rows: CompareRow[];
  label: (row: CompareRow) => string;
  /** Rows whose revenue is also shown per worked day of that weekday. */
  perDay?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table comparison-table" aria-label={t(title)}>
        <caption>{t(title)}</caption>
        <thead>
          <tr>
            <th>{t('Группа')}</th>
            <th>{t('Выручка сейчас')}</th>
            <th>{t('Выручка в базе')}</th>
            <th>{t('Изменение')}</th>
            <th>{t('%')}</th>
            {perDay && <th>{t('За рабочий день: сейчас / база')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{label(row)}</td>
              <td>{formatMoney(row.current.revenue)}</td>
              <td>{formatMoney(row.base.revenue)}</td>
              <td>{signed(row.revenueDelta)}</td>
              <td>{percent(row.revenuePct)}</td>
              {perDay && (
                <td>
                  {row.current.workedDays ? formatMoney(row.current.revenuePerDay) : '—'} /{' '}
                  {row.base.workedDays ? formatMoney(row.base.revenuePerDay) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">{t('Продаж в этих периодах нет.')}</p>}
    </div>
  );
}

/**
 * The selected report period against a base period: totals, weekdays, hours (Yerevan time) and categories,
 * and the revenue change split into volume, mix, price and range effects that add up to the difference.
 */
export function PeriodComparison({ from, to }: { from: string; to: string }) {
  const [kind, setKind] = useSessionFilter<BaseKind>('compare-base', 'previous');
  const [customFrom, setCustomFrom] = useSessionFilter<string>('compare-from', businessToday());
  const [customTo, setCustomTo] = useSessionFilter<string>('compare-to', businessToday());
  const end = to > businessToday() ? businessToday() : to;
  const current = useMemo(() => ({ from, to: end }), [from, end]);
  const base = useMemo(
    () => basePeriod(kind, current, { from: customFrom, to: customTo >= customFrom ? customTo : customFrom }),
    [kind, current, customFrom, customTo],
  );
  const { value, error, loading } = useComparison(current, base);
  const d = value?.decomposition;
  return (
    <section className="panel comparison-panel">
      <h2>{t('Сравнение периодов')}</h2>
      <p className="muted">
        {t(
          'Сравнение показывает, что изменилось, но не доказывает причину: на продажи влияют погода, события, наличие и цены вместе.',
        )}
      </p>
      <div className="form-grid">
        <Field label="Сравнить с">
          <select value={kind} onChange={(e) => setKind(e.target.value as BaseKind)}>
            <option value="previous">{t('Предыдущий период такой же длины')}</option>
            <option value="week">{t('Те же дни неделей раньше')}</option>
            <option value="year">{t('Те же даты годом раньше')}</option>
            <option value="custom">{t('Свой период')}</option>
          </select>
        </Field>
        {kind === 'custom' && (
          <>
            <Field label="База: с">
              <input
                type="date"
                max={businessToday()}
                value={customFrom}
                onChange={(e) => e.target.value && setCustomFrom(e.target.value)}
              />
            </Field>
            <Field label="База: по">
              <input
                type="date"
                min={customFrom}
                max={businessToday()}
                value={customTo}
                onChange={(e) => e.target.value && setCustomTo(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
      <p className="muted">
        {current.from} — {current.to} {t('против')} {base.from} — {base.to}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {loading && <LoadingStatus label="Считаем сравнение…" />}
      {value && d && (
        <>
          <TotalsTable current={value.current} base={value.base} />
          {(value.unknownCostOperations.current > 0 || value.unknownCostOperations.base > 0) && (
            <p className="muted" role="note">
              {t('Часть продаж без известной себестоимости: валовая прибыль по ним завышена. Сейчас / база:')}{' '}
              {value.unknownCostOperations.current} / {value.unknownCostOperations.base}
            </p>
          )}
          <div className="table-scroll">
            <table
              className="data-table comparison-table"
              aria-label={t('Из чего сложилось изменение выручки')}
            >
              <caption>{t('Из чего сложилось изменение выручки')}</caption>
              <tbody>
                {(
                  [
                    ['Количество (столько же позиций по прежней средней цене)', d.volume],
                    ['Ассортимент (сдвиг между дешёвыми и дорогими позициями)', d.mix],
                    ['Цена (изменение цен у позиций в обоих периодах)', d.price],
                    ['Новые и ушедшие позиции', d.range],
                  ] as const
                ).map(([label, amount]) => (
                  <tr key={label}>
                    <td>{t(label)}</td>
                    <td>{signed(amount)}</td>
                  </tr>
                ))}
                <tr className="comparison-sum">
                  <th scope="row">{t('Изменение выручки')}</th>
                  <th>{signed(d.delta)}</th>
                </tr>
              </tbody>
            </table>
          </div>
          <DimensionTable
            title="По дням недели"
            rows={value.weekdays}
            label={(row) => weekday(row.key)}
            perDay
          />
          <DimensionTable
            title="По часам (время Еревана)"
            rows={value.hours}
            label={(row) => (row.key === 'unknown' ? t('Время неизвестно (внесено позже)') : `${row.key}:00`)}
          />
          <DimensionTable
            title="По категориям"
            rows={value.categories}
            label={(row) =>
              row.key === 'alcohol' ? t('Алкоголь в розлив') : t(categoryLabel(row.key as never))
            }
          />
        </>
      )}
    </section>
  );
}

import { BarChart3, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { businessToday } from '../../domain/business-day';
import { categoryLabel } from '../../domain/model';
import {
  basePeriod,
  changePct,
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
import { DatePicker } from '../../ui/date-picker';
import { Field } from '../../ui/fields';
import { LoadingStatus } from '../../ui/loading';

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatMoney(n)}`;
/** «+12.5%»; growth from a zero base is «новое», and nothing is shown when both values are zero. */
const percent = (pct: number | null, now: number) =>
  pct !== null ? `${pct > 0 ? '+' : ''}${pct}%` : now > 0 ? t('новое') : '';
const quantity = (n: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(n);
const signedQuantity = (n: number) => `${n > 0 ? '+' : ''}${quantity(n)}`;
const day = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const range = (period: { from: string; to: string }) =>
  period.from === period.to ? day(period.from) : `${day(period.from)} — ${day(period.to)}`;
/** Growth is green and a fall red; neutral measures (cost, working days) keep the arrow but not the colour. */
const tone = (n: number, neutral = false) =>
  `${n > 0 ? 'is-up' : n < 0 ? 'is-down' : 'is-flat'}${neutral ? ' is-neutral' : ''}`;
/** The width of a bar against the largest value of its group. */
const share = (value: number, largest: number) =>
  ({ '--share': largest ? Math.abs(value) / largest : 0 }) as CSSProperties;

/** The change badge: amount and percent, or «без изменений» instead of a bare «0». */
function Change({
  value,
  text,
  pct = '',
  neutral,
}: {
  value: number;
  text: string;
  pct?: string;
  neutral?: boolean;
}) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={`comparison-change ${tone(value, neutral)}`}>
      <Icon size={16} aria-hidden="true" />
      {value ? [text, pct].filter(Boolean).join(' · ') : t('без изменений')}
    </span>
  );
}
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

interface TotalRow {
  label: string;
  now: number;
  before: number;
  format: (n: number) => string;
  change: (n: number) => string;
  neutral?: boolean;
}

const totalRows = (current: Totals, base: Totals): TotalRow[] => [
  { label: 'Выручка', now: current.revenue, before: base.revenue, format: formatMoney, change: signed },
  {
    label: 'Себестоимость',
    now: current.cost,
    before: base.cost,
    format: formatMoney,
    change: signed,
    neutral: true,
  },
  { label: 'Валовая прибыль', now: current.profit, before: base.profit, format: formatMoney, change: signed },
  { label: 'Порции', now: current.units, before: base.units, format: quantity, change: signedQuantity },
  {
    label: 'Рабочих дней',
    now: current.workedDays,
    before: base.workedDays,
    format: String,
    change: signedQuantity,
    neutral: true,
  },
  {
    label: 'Выручка за рабочий день',
    now: current.revenuePerDay,
    before: base.revenuePerDay,
    format: formatMoney,
    change: signed,
  },
];

/** Rounded to the cent so that float noise is neither coloured nor shown as «+0». */
const difference = (row: TotalRow) => Math.round((row.now - row.before) * 100) / 100;

const headline = ['Выручка', 'Валовая прибыль', 'Выручка за рабочий день'];

/**
 * The three figures an owner looks at first as large cards: now, what it was, and by how much it moved;
 * the other measures follow as small tiles of the same shape.
 */
function TotalCards({ rows }: { rows: TotalRow[] }) {
  const card = (row: TotalRow) => {
    const delta = difference(row);
    return (
      <li key={row.label}>
        <span className="comparison-card-label">{t(row.label)}</span>
        <strong>{row.format(row.now)}</strong>
        <span className="comparison-card-base">
          {t('было')} {row.format(row.before)}
        </span>
        <Change
          value={delta}
          text={row.change(delta)}
          pct={percent(changePct(row.now, row.before), row.now)}
          neutral={row.neutral}
        />
      </li>
    );
  };
  return (
    <>
      <ul className="comparison-cards">{rows.filter((row) => headline.includes(row.label)).map(card)}</ul>
      <ul className="comparison-metrics" aria-label={t('Другие показатели')}>
        {rows.filter((row) => !headline.includes(row.label)).map(card)}
      </ul>
    </>
  );
}

const parts = [
  ['Количество', 'больше или меньше порций по прежней средней цене', 'volume'],
  ['Ассортимент', 'сдвиг между дешёвыми и дорогими позициями', 'mix'],
  ['Цена', 'изменение цен у позиций, проданных в обоих периодах', 'price'],
  ['Новые и ушедшие позиции', 'позиции, которые продавались только в одном из периодов', 'range'],
] as const;

/** Volume, mix, price and range add up to the revenue change; the bar shows each part against the largest one. */
function Decomposition({ d, totals }: { d: Comparison['decomposition']; totals: [Totals, Totals] }) {
  const largest = Math.max(...parts.map(([, , key]) => Math.abs(d[key])));
  const [current, base] = totals;
  const title = 'Из чего сложилось изменение выручки';
  return (
    <section className="comparison-section" aria-label={t(title)}>
      <h3>{t(title)}</h3>
      <ul className="comparison-parts">
        {parts.map(([label, hint, key]) => (
          <li key={key}>
            <span className="comparison-row-name">
              <strong>{t(label)}</strong>
              <small>{t(hint)}</small>
            </span>
            <Change value={d[key]} text={signed(d[key])} />
            <span
              className={`comparison-bar ${tone(d[key])}`}
              style={share(d[key], largest)}
              aria-hidden="true"
            />
          </li>
        ))}
      </ul>
      <p className="comparison-sum">
        <strong>{t('Изменение выручки')}</strong>
        <Change
          value={d.delta}
          text={signed(d.delta)}
          pct={percent(changePct(current.revenue, base.revenue), current.revenue)}
        />
      </p>
    </section>
  );
}

/** Revenue of each weekday, hour or category: now in bold, the base below, the change on the right. */
function DimensionList({
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
  if (!rows.length) return null;
  const largest = Math.max(...rows.map((row) => Math.max(row.current.revenue, row.base.revenue)));
  const perWorkedDay = (totals: Totals) => (totals.workedDays ? formatMoney(totals.revenuePerDay) : '—');
  return (
    <section className="comparison-section comparison-dimension" aria-label={t(title)}>
      <h3>{t(title)}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            <span className="comparison-row-name">
              <strong>{label(row)}</strong>
              <small>
                {t('было')} {formatMoney(row.base.revenue)}
              </small>
              {perDay && (
                <small>
                  {t('за рабочий день')}: {perWorkedDay(row.current)} · {t('было')} {perWorkedDay(row.base)}
                </small>
              )}
            </span>
            <span className="comparison-row-value">
              <strong>{formatMoney(row.current.revenue)}</strong>
              <Change
                value={row.revenueDelta}
                text={signed(row.revenueDelta)}
                pct={percent(row.revenuePct, row.current.revenue)}
              />
            </span>
            <span
              className="comparison-bar is-share"
              style={share(row.current.revenue, largest)}
              aria-hidden="true"
            />
          </li>
        ))}
      </ul>
    </section>
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
  const totals = value ? totalRows(value.current, value.base) : [];
  const empty =
    !!value && !value.current.revenue && !value.current.units && !value.base.revenue && !value.base.units;
  return (
    <section className="panel comparison-panel">
      <div className="section-title">
        <h2>{t('Сравнение периодов')}</h2>
      </div>
      <p className="muted comparison-hint">
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
              <DatePicker
                label="База: с"
                max={businessToday()}
                value={customFrom}
                onChange={(value) => value && setCustomFrom(value)}
              />
            </Field>
            <Field label="База: по">
              <DatePicker
                label="База: по"
                min={customFrom}
                max={businessToday()}
                value={customTo}
                onChange={(value) => value && setCustomTo(value)}
              />
            </Field>
          </>
        )}
      </div>
      <div className="comparison-periods">
        <div className="is-current">
          <span>{t('Текущий период')}</span>
          <strong>{range(current)}</strong>
        </div>
        <span className="comparison-versus">{t('против')}</span>
        <div className="is-base">
          <span>{t('База')}</span>
          <strong>{range(base)}</strong>
        </div>
      </div>
      {error && <p role="alert">{t(error)}</p>}
      {loading && <LoadingStatus label="Считаем сравнение…" />}
      {empty && (
        <div className="comparison-empty" role="status">
          <BarChart3 size={28} aria-hidden="true" />
          <strong>{t('В обоих периодах нет продаж')}</strong>
          <span>{t('Выберите другой месяц или базу для сравнения.')}</span>
        </div>
      )}
      {value && d && !empty && (
        <>
          <TotalCards rows={totals} />
          {(value.unknownCostOperations.current > 0 || value.unknownCostOperations.base > 0) && (
            <p className="comparison-warning" role="note">
              {t('Часть продаж без известной себестоимости: валовая прибыль по ним завышена. Сейчас / база:')}{' '}
              {value.unknownCostOperations.current} / {value.unknownCostOperations.base}
            </p>
          )}
          <div className="comparison-details">
            <Decomposition d={d} totals={[value.current, value.base]} />
            <DimensionList
              title="По дням недели"
              rows={value.weekdays}
              label={(row) => weekday(row.key)}
              perDay
            />
            <DimensionList
              title="По часам (время Еревана)"
              rows={value.hours}
              label={(row) =>
                row.key === 'unknown' ? t('Время неизвестно (внесено позже)') : `${row.key}:00`
              }
            />
            <DimensionList
              title="По категориям"
              rows={value.categories}
              label={(row) =>
                row.key === 'alcohol' ? t('Алкоголь в розлив') : t(categoryLabel(row.key as never))
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

import { useSessionFilter } from '../presentation/use-session-filter';
import { menuQuantitySummary } from '../domain/quantity-summary';
import { ArrowDownToLine, ArrowUpRight, Banknote, CalendarDays, GlassWater, ReceiptText } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { download, ExportButton } from '../ui/export';
import { Empty, Metric, PageHeading } from '../ui/layout';
import { displayCurrency, formatMoney as money } from '../presentation/currency/format-money';
import { businessDayHint, businessToday } from '../domain/business-day';
import { activeSales, categoryLabel, ingredientVolume, priceBasis, round, saleUnit } from '../domain/model';
import { reportAnalytics } from '../domain/reports/analytics';
import { inReportPeriod, revenueSeries, type ReportPeriod } from '../domain/reports/period';
import type { MenuCategory } from '../domain/types';
import { ReportPerformance } from '../features/reports/ReportPerformance';
import { locale, t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';

export default function Reports() {
  const { data } = useBar();
  const [mode, setMode] = useSessionFilter<string>('mode', 'month');
  const [day, setDay] = useBusinessDate();
  const [month, setMonth] = useSessionFilter<string>('month', businessToday().slice(0, 7));
  const [from, setFrom] = useSessionFilter<string>('from', businessToday().slice(0, 7) + '-01');
  const [to, setTo] = useSessionFilter<string>('to', businessToday());
  const period: ReportPeriod = useMemo(
    () => (mode === 'range' ? { from, to } : mode === 'day' ? day : month),
    [mode, from, to, day, month],
  );
  const exportPeriod = typeof period === 'string' ? period : `${period.from}_${period.to}`;
  const analytics = useMemo(() => reportAnalytics(data, period), [data, period]);
  const records = data.sales.filter((s) => inReportPeriod(s.date, period));
  const sales = activeSales(data).filter((s) => inReportPeriod(s.date, period));
  const purchases = data.purchases.filter((p) => inReportPeriod(p.date, period));
  const revenue = round(sales.reduce((sum, s) => sum + s.revenue, 0));
  const cost = round(sales.reduce((sum, s) => sum + s.cost, 0));
  const bought = round(
    purchases.reduce((sum, p) => sum + (p.ml * p.costPerLiter) / priceBasis(data, p.alcoholId), 0),
  );
  const cocktailCount = sales.filter((s) => s.kind === 'cocktail').reduce((sum, s) => sum + s.quantity, 0);
  const groups: Record<
    string,
    {
      name: string;
      servingMl?: number;
      unit?: 'bottle' | 'glass';
      category?: MenuCategory;
      kind: string;
      quantity: number;
      revenue: number;
      cost: number;
    }
  > = {};
  sales.forEach((s) => {
    const key = `${s.kind}-${s.productId}-${s.unit || ''}-${s.servingMl || ''}`;
    const row = groups[key] || {
      name: s.name,
      category: s.category,
      kind: s.kind,
      unit: s.unit,
      servingMl: s.servingMl,
      quantity: 0,
      revenue: 0,
      cost: 0,
    };
    row.quantity += s.quantity;
    row.revenue += s.revenue;
    row.cost += s.cost;
    groups[key] = row;
  });
  const rows = Object.values(groups).sort((a, b) => b.revenue - a.revenue);
  const consumed: Record<string, number> = {};
  sales.forEach((s) =>
    s.ingredients.forEach((i) => {
      consumed[i.alcoholId] = (consumed[i.alcoholId] || 0) + i.ml;
    }),
  );
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const chartFrom = mode === 'range' ? from : mode === 'day' ? day : month + '-01';
  const chartTo =
    mode === 'range' ? to : mode === 'day' ? day : month + '-' + String(daysInMonth).padStart(2, '0');
  const bars = revenueSeries(sales, chartFrom, chartTo);
  const groupedChart = bars.some((b) => b.date !== b.end);
  const peak = Math.max(1, ...bars.map((b) => b.amount));
  function exportCsv() {
    const safe = (s: string | number) => {
      let value = String(s);
      if (/^[=+\-@\t\r]/.test(value)) {
        value = `'${value}`;
      }
      return `"${value.replace(/"/g, '""')}"`;
    };
    const csv = [
      [
        'Дата',
        'Напиток',
        'Тип',
        'Количество',
        'Единица',
        'Объём бокала мл',
        'Выручка AMD',
        'Себестоимость AMD',
        'Валовая прибыль AMD',
        'Статус',
      ],
      ...records.map((s) => [
        s.date,
        s.name,
        s.kind === 'cocktail' ? categoryLabel(s.category) : 'Алкоголь',
        s.quantity,
        saleUnit(s),
        s.servingMl || '',
        s.revenue,
        s.cost,
        round(s.revenue - s.cost),
        s.voided ? 'Отменена' : 'Продана',
      ]),
    ]
      .map((row) => row.map(safe).join(';'))
      .join('\r\n');
    download(`barbar-report-${exportPeriod}.csv`, csv, true);
  }
  return (
    <>
      <PageHeading
        eyebrow="ЦИФРЫ СО ВКУСОМ"
        title={t('Отчёты и аналитика')}
        description="Посмотрите, что любят гости и сколько приносит каждый напиток."
      >
        <button className="button secondary" onClick={exportCsv}>
          <ArrowDownToLine size={17} />
          {t(' Скачать CSV')}
        </button>
      </PageHeading>
      <div className="report-filter">
        <div className="segmented">
          <button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>
            {t('За день')}
          </button>
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>
            {t('За месяц')}
          </button>
          <button className={mode === 'range' ? 'active' : ''} onClick={() => setMode('range')}>
            {t('Период')}
          </button>
        </div>
        <label className="date-control">
          <CalendarDays size={17} />
          {t(
            mode === 'range' ? (
              <>
                <input
                  type="date"
                  aria-label={t('Начало периода')}
                  value={from}
                  max={to}
                  onChange={(e) => {
                    if (e.target.value && e.target.value <= to) setFrom(e.target.value);
                  }}
                />
                <span>—</span>
                <input
                  type="date"
                  aria-label={t('Конец периода')}
                  value={to}
                  min={from}
                  max={businessToday()}
                  onChange={(e) => {
                    if (e.target.value && e.target.value >= from && e.target.value <= businessToday())
                      setTo(e.target.value);
                  }}
                />
              </>
            ) : mode === 'day' ? (
              <input
                type="date"
                aria-label={t('День отчёта')}
                max={businessToday()}
                value={day}
                onChange={(e) => {
                  if (e.target.value && e.target.value <= businessToday()) {
                    setDay(e.target.value);
                  }
                }}
              />
            ) : (
              <input
                type="month"
                aria-label={t('Месяц отчёта')}
                max={businessToday().slice(0, 7)}
                value={month}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value) && e.target.value <= businessToday().slice(0, 7)) {
                    setMonth(e.target.value);
                  }
                }}
              />
            ),
          )}
        </label>
        <span className="muted">
          {t(businessDayHint)} · {displayCurrency()}
        </span>
      </div>
      {t(
        data.archived && (
          <p className="history-notice">
            {t('История до ')}
            {t(data.archived.before)}
            {t(' удалена. Отчёты за этот период недоступны; остатки на складе сохранены.')}
          </p>
        ),
      )}
      <section className="metrics">
        <Metric
          label="Выручка"
          value={money(revenue)}
          hint={`${sales.length} операций за период`}
          icon={<Banknote size={18} />}
          accent
        />
        <Metric
          label="Валовая прибыль"
          value={money(round(revenue - cost))}
          hint={`Себестоимость: ${money(cost)}`}
          icon={<ArrowUpRight size={18} />}
        />
        <Metric
          label="Продано из меню"
          value={`${cocktailCount} ед.`}
          hint={menuQuantitySummary(sales)}
          icon={<GlassWater size={18} />}
        />
        <Metric
          label="Закупки за период"
          value={money(bought)}
          hint={`${purchases.length} поставок на склад`}
          icon={<ReceiptText size={18} />}
        />
      </section>
      <ReportPerformance period={period} />
      <section className="panel analytics-panel">
        <div className="section-title">
          <div>
            <h2>{t('Что можно улучшить')}</h2>
            <p>{t('Подсказки по продажам выбранного периода и текущим остаткам')}</p>
          </div>
        </div>
        <div className="analytics-numbers">
          <div>
            <span>{t('Средняя операция')}</span>
            <strong>{t(money(analytics.averageOperation))}</strong>
            <small>{t('Одна запись продажи, не чек гостя')}</small>
          </div>
          <div>
            <span>{t('Валовая маржа')}</span>
            <strong>
              {t(analytics.knownMargin === null ? '—' : `${analytics.knownMargin.toFixed(1)}%`)}
            </strong>
            <small>{t('Только продажи с заполненной стоимостью')}</small>
          </div>
          <div>
            <span>{t('Полнота себестоимости')}</span>
            <strong>{t(analytics.costCoverage.toFixed(0))}%</strong>
            <small>{t('Доля операций с известной стоимостью')}</small>
          </div>
          <div>
            <span>{t('Доля отмен')}</span>
            <strong>{t(analytics.cancelRate.toFixed(1))}%</strong>
            <small>{t('От всех записей периода')}</small>
          </div>
        </div>
        <div className="report-insights">
          {t(
            analytics.insights.map((insight) => (
              <article key={insight.id} className={`report-insight ${insight.tone}`}>
                <h3>{t(insight.title)}</h3>
                <p>{t(insight.detail)}</p>
                <Link to={insight.href}>{t(insight.action)} ↗</Link>
              </article>
            )),
          )}
        </div>
        <p className="muted analytics-note">
          {t(
            'Валовая прибыль не учитывает аренду, зарплаты и другие расходы бара. Порог маржи 30% — ориентир для проверки, а не обязательная цена.',
          )}
        </p>
      </section>
      <section className="panel chart-panel">
        <div className="section-title">
          <div>
            <h2>{t('Ритм вашего бара')}</h2>
            <p>
              {t(groupedChart ? 'Выручка по периодам ·' : 'Выручка по дням ·')}
              {t(' ')}
              {t(
                mode === 'range'
                  ? `${from} — ${to}`
                  : mode === 'month'
                    ? new Date(`${month}-01T12:00:00`).toLocaleDateString(locale(), {
                        month: 'long',
                        year: 'numeric',
                      })
                    : new Date(`${day}T12:00:00`).toLocaleDateString(locale()),
              )}
            </p>
          </div>
          <span className="chart-legend">
            <i />
            {t('Выручка')} · {displayCurrency()}
          </span>
        </div>
        <div className="chart">
          <div className="chart-axis">
            <span>{t(money(round(peak)))}</span>
            <span>{t(money(round(peak / 2)))}</span>
            <span>{money(0)}</span>
          </div>
          <div className="chart-bars">
            {t(
              bars.map((b) => (
                <div className="chart-column" key={b.date}>
                  <div
                    className={`chart-bar ${b.amount ? '' : 'zero'}`}
                    style={{ height: `${Math.max(b.amount ? 2 : 0, (b.amount / peak) * 100)}%` }}
                    title={t(`${b.date}${b.end !== b.date ? ` — ${b.end}` : ''}: ${money(b.amount)}`)}
                    aria-label={t(`${b.date}: ${money(b.amount)}`)}
                  />
                  <span>{t(groupedChart ? b.date.slice(5) : b.date.slice(-2))}</span>
                </div>
              )),
            )}
          </div>
        </div>
        {t(
          !sales.length && (
            <p className="chart-empty">
              {t('За этот период продаж пока нет. Добавьте их в разделе «Продажи».')}
            </p>
          ),
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Что продавалось')}</h2>
            <p>{t('Количество, выручка и прибыль по каждому напитку')}</p>
          </div>
          <ExportButton name={`sales-${exportPeriod}.json`} value={records} />
        </div>
        {t(
          rows.length ? (
            <div className="table-scroll">
              <table className="data-table report-sales-table" aria-label={t('Продажи по позициям')}>
                <thead>
                  <tr>
                    <th>{t('Напиток')}</th>
                    <th>{t('Количество')}</th>
                    <th>{t('Выручка')}</th>
                    <th>{t('Себестоимость')}</th>
                    <th>{t('Валовая прибыль')}</th>
                  </tr>
                </thead>
                <tbody>
                  {t(
                    rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{t(r.name)}</strong>
                          {t(
                            r.servingMl && (
                              <small className="table-subtitle">
                                {t('По')}
                                {t(r.servingMl)}
                                {t(' мл')}
                              </small>
                            ),
                          )}
                          <small className="table-subtitle">
                            {t(r.kind === 'cocktail' ? categoryLabel(r.category) : 'Алкоголь')}
                          </small>
                        </td>
                        <td>
                          {t(r.quantity)} {t(saleUnit(r))}
                        </td>
                        <td>{t(money(round(r.revenue)))}</td>
                        <td>{t(money(round(r.cost)))}</td>
                        <td>
                          <strong className={r.revenue >= r.cost ? 'positive-text' : 'negative-text'}>
                            {t(money(round(r.revenue - r.cost)))}
                          </strong>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t('Итого')}</td>
                    <td>{t(money(revenue))}</td>
                    <td>{t(money(cost))}</td>
                    <td>{t(money(round(revenue - cost)))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <Empty
              title={t('Здесь будет история вкусов')}
              text="Выберите другой период или запишите первую продажу."
            />
          ),
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Расход ингредиентов')}</h2>
            <p>{t('Алкоголь и миксеры в коктейлях плюс продажи в розлив')}</p>
          </div>
        </div>
        <div className="consumption-grid">
          {t(
            Object.entries(consumed).map(([id, ml]) => (
              <div key={id}>
                <span>{t(data.alcohol.find((a) => a.id === id)?.name)}</span>
                <strong>{t(ingredientVolume(data, id, round(ml)))}</strong>
              </div>
            )),
          )}
        </div>
        {t(
          !Object.keys(consumed).length && <p className="muted">{t('Списаний за выбранный период нет.')}</p>,
        )}
      </section>
      <p className="page-footnote">
        {t(
          'Валовая прибыль учитывает только стоимость ингредиентов. Аренда, зарплата, налоги и прочие расходы сюда не входят. Отменённые продажи исключены из итогов; в выгрузке сохранён их статус.',
        )}
      </p>
    </>
  );
}

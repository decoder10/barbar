import { ShiftReport } from '../features/reports/ShiftReport';
import { LoadingStatus } from '../ui/loading';
import { useServerReport } from '../features/reports/use-server-report';
import { useSessionFilter } from '../presentation/use-session-filter';
import { menuQuantitySummary } from '../domain/quantity-summary';
import { ArrowDownToLine, ArrowUpRight, Banknote, CalendarDays, GlassWater, ReceiptText } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { download, ExportButton } from '../ui/export';
import { Empty, Metric, PageHeading } from '../ui/layout';
import { displayCurrency, formatMoney as money } from '../presentation/currency/format-money';
import { businessDayHint, businessToday } from '../domain/business-day';
import { activeSales, categoryLabel, ingredientVolume, round, saleUnit } from '../domain/model';
import { reportAnalytics } from '../domain/reports/analytics';
import { toCsv } from '../domain/reports/csv';
import { reportTotals } from '../domain/reports/totals';
import { inReportPeriod, revenueSeries, type ReportPeriod } from '../domain/reports/period';
import { PeriodComparison } from '../features/reports/PeriodComparison';
import { PriceHistory } from '../features/reports/PriceHistory';
import { Purchasing } from '../features/reports/Purchasing';
import { ReportPerformance } from '../features/reports/ReportPerformance';
import { locale, t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';

export default function Reports() {
  const { data } = useBar();
  const [search] = useSearchParams();
  const [priceKind, ...priceRest] = (search.get('price') || '').split(':');
  const priceProduct =
    (priceKind === 'cocktail' || priceKind === 'alcohol') && priceRest.length
      ? { kind: priceKind as 'cocktail' | 'alcohol', id: priceRest.join(':') }
      : undefined;
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
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const chartFrom = mode === 'range' ? from : mode === 'day' ? day : month + '-01';
  const chartTo =
    mode === 'range' ? to : mode === 'day' ? day : month + '-' + String(daysInMonth).padStart(2, '0');
  const remote = useServerReport(chartFrom, chartTo);
  const localAnalytics = useMemo(() => reportAnalytics(data, period), [data, period]);
  const analytics = remote.report?.analytics || localAnalytics;
  const records = data.sales.filter((s) => inReportPeriod(s.date, period));
  const sales = activeSales(data).filter((s) => inReportPeriod(s.date, period));
  const purchases = data.purchases.filter((p) => inReportPeriod(p.date, period));
  // One source for every headline figure: the server report when the ledger is paged, else local sales.
  const { revenue, cost, bought, cocktailCount, operationCount, rows, consumed } = reportTotals(
    remote.report,
    sales,
    purchases,
    data,
  );
  const bars = revenueSeries(remote.report?.daily || sales, chartFrom, chartTo);
  const groupedChart = bars.some((b) => b.date !== b.end);
  const peak = Math.max(1, ...bars.map((b) => b.amount));
  function exportCsv() {
    if (remote.report) {
      download(
        `barbar-summary-${exportPeriod}.csv`,
        toCsv([
          ['Напиток', 'Количество', 'Выручка AMD', 'Себестоимость AMD'],
          ...rows.map((r) => [r.name, r.quantity, r.revenue, r.cost]),
        ]),
        true,
      );
      return;
    }
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
    ];
    download(`barbar-report-${exportPeriod}.csv`, toCsv(csv), true);
  }
  return (
    <>
      <PageHeading
        eyebrow="ЦИФРЫ СО ВКУСОМ"
        title={t('Отчёты и аналитика')}
        description="Посмотрите, что любят гости и сколько приносит каждый напиток."
      >
        <button className="button secondary" onClick={exportCsv} disabled={!!data.opening && !remote.report}>
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
      <ShiftReport from={chartFrom} to={chartTo > businessToday() ? businessToday() : chartTo} />
      {t(
        data.archived && (
          <p className="history-notice">
            {t('История до ')}
            {t(data.archived.before)}
            {t(' удалена. Отчёты за этот период недоступны; остатки на складе сохранены.')}
          </p>
        ),
      )}
      {remote.error && <p role="alert">{t(remote.error)}</p>}
      <>{remote.loading && <LoadingStatus label="Рассчитываем отчёт…" />}</>
      {(!data.opening || remote.report) && (
        <>
          <section className="metrics">
            <Metric
              label="Выручка"
              value={money(revenue)}
              hint={`${operationCount} операций за период`}
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
              hint={menuQuantitySummary(remote.report?.groups || sales)}
              icon={<GlassWater size={18} />}
            />
            <Metric
              label="Закупки за период"
              value={money(bought)}
              hint={`${remote.report?.purchaseCount ?? purchases.length} поставок на склад`}
              icon={<ReceiptText size={18} />}
            />
          </section>
          <ReportPerformance period={period} serverRows={remote.report?.performance} />
          <PeriodComparison from={chartFrom} to={chartTo} />
          <PriceHistory
            key={priceProduct ? `${priceProduct.kind}:${priceProduct.id}` : 'all'}
            product={priceProduct}
          />
          <Purchasing from={chartFrom} to={chartTo} />
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
              !operationCount && (
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
              <ExportButton name={`sales-${exportPeriod}.json`} value={remote.report || records} />
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
              !Object.keys(consumed).length && (
                <p className="muted">{t('Списаний за выбранный период нет.')}</p>
              ),
            )}
          </section>
          <p className="page-footnote">
            {t(
              'Валовая прибыль учитывает только стоимость ингредиентов. Аренда, зарплата, налоги и прочие расходы сюда не входят. Отменённые продажи исключены из итогов; в выгрузке сохранён их статус.',
            )}
          </p>
        </>
      )}
    </>
  );
}

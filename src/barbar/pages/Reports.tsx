import { useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Banknote, CalendarDays, GlassWater, ReceiptText } from 'lucide-react';
import {
  activeSales,
  saleUnit,
  priceBasis,
  categoryLabel,
  ingredientVolume,
  money,
  round,
  today,
} from '../model';
import { download, Empty, ExportButton, Metric, PageHeading } from '../components';
import type { MenuCategory } from '../types';
import { useBar } from '../store';

export default function Reports() {
  const { data } = useBar();
  const [mode, setMode] = useState('month');
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today().slice(0, 7));
  const period = mode === 'day' ? day : month;
  const records = data.sales.filter((s) => s.date.startsWith(period));
  const sales = activeSales(data).filter((s) => s.date.startsWith(period));
  const purchases = data.purchases.filter((p) => p.date.startsWith(period));
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
      unit?: 'bottle' | 'glass';
      category?: MenuCategory;
      kind: string;
      quantity: number;
      revenue: number;
      cost: number;
    }
  > = {};
  sales.forEach((s) => {
    const key = `${s.kind}-${s.productId}`;
    const row = groups[key] || {
      name: s.name,
      category: s.category,
      kind: s.kind,
      unit: s.unit,
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
  const days =
    mode === 'day'
      ? [day]
      : Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const bars = days.map((date) => ({
    date,
    amount: sales.filter((s) => s.date === date).reduce((n, s) => n + s.revenue, 0),
  }));
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
        s.revenue,
        s.cost,
        round(s.revenue - s.cost),
        s.voided ? 'Отменена' : 'Продана',
      ]),
    ]
      .map((row) => row.map(safe).join(';'))
      .join('\r\n');
    download(`barbar-report-${period}.csv`, csv, true);
  }
  return (
    <>
      <PageHeading
        eyebrow="ЦИФРЫ СО ВКУСОМ"
        title="Отчёты и аналитика"
        description="Посмотрите, что любят гости и сколько приносит каждый напиток."
      >
        <button className="button secondary" onClick={exportCsv}>
          <ArrowDownToLine size={17} /> Скачать CSV
        </button>
      </PageHeading>
      <div className="report-filter">
        <div className="segmented">
          <button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>
            За день
          </button>
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>
            За месяц
          </button>
        </div>
        <label className="date-control">
          <CalendarDays size={17} />
          {mode === 'day' ? (
            <input
              type="date"
              aria-label="День отчёта"
              max={today()}
              value={day}
              onChange={(e) => {
                if (e.target.value && e.target.value <= today()) {
                  setDay(e.target.value);
                }
              }}
            />
          ) : (
            <input
              type="month"
              aria-label="Месяц отчёта"
              max={today().slice(0, 7)}
              value={month}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value) && e.target.value <= today().slice(0, 7)) {
                  setMonth(e.target.value);
                }
              }}
            />
          )}
        </label>
        <span className="muted">Часовой пояс: Ереван · AMD ֏</span>
      </div>
      {data.archived && (
        <p className="history-notice">
          История до {data.archived.before} удалена. Отчёты за этот период недоступны; остатки на складе
          сохранены.
        </p>
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
          label="Продано порций"
          value={`${cocktailCount} порц.`}
          hint={`${rows.filter((r) => r.kind === 'cocktail').length} позиций меню`}
          icon={<GlassWater size={18} />}
        />
        <Metric
          label="Закупки за период"
          value={money(bought)}
          hint={`${purchases.length} поставок на склад`}
          icon={<ReceiptText size={18} />}
        />
      </section>
      <section className="panel chart-panel">
        <div className="section-title">
          <div>
            <h2>Ритм вашего бара</h2>
            <p>
              Выручка по дням ·{' '}
              {mode === 'month'
                ? new Date(`${month}-01T12:00:00`).toLocaleDateString('ru-RU', {
                    month: 'long',
                    year: 'numeric',
                  })
                : new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU')}
            </p>
          </div>
          <span className="chart-legend">
            <i /> Выручка, ֏
          </span>
        </div>
        <div className="chart">
          <div className="chart-axis">
            <span>{money(round(peak))}</span>
            <span>{money(round(peak / 2))}</span>
            <span>0 ֏</span>
          </div>
          <div className="chart-bars">
            {bars.map((b) => (
              <div className="chart-column" key={b.date}>
                <div
                  className={`chart-bar ${b.amount ? '' : 'zero'}`}
                  style={{ height: `${Math.max(b.amount ? 2 : 0, (b.amount / peak) * 100)}%` }}
                  title={`${b.date}: ${money(b.amount)}`}
                  aria-label={`${b.date}: ${money(b.amount)}`}
                />
                <span>{b.date.slice(-2)}</span>
              </div>
            ))}
          </div>
        </div>
        {!sales.length && (
          <p className="chart-empty">За этот период продаж пока нет. Добавьте их в разделе «Продажи».</p>
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Что продавалось</h2>
            <p>Количество, выручка и прибыль по каждому напитку</p>
          </div>
          <ExportButton name={`sales-${period}.json`} value={records} />
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Напиток</th>
                  <th>Количество</th>
                  <th>Выручка</th>
                  <th>Себестоимость</th>
                  <th>Валовая прибыль</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{r.name}</strong>
                      <small className="table-subtitle">
                        {r.kind === 'cocktail' ? categoryLabel(r.category) : 'Алкоголь'}
                      </small>
                    </td>
                    <td>
                      {r.quantity} {saleUnit(r)}
                    </td>
                    <td>{money(round(r.revenue))}</td>
                    <td>{money(round(r.cost))}</td>
                    <td>
                      <strong className={r.revenue >= r.cost ? 'positive-text' : 'negative-text'}>
                        {money(round(r.revenue - r.cost))}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Итого</td>
                  <td>{money(revenue)}</td>
                  <td>{money(cost)}</td>
                  <td>{money(round(revenue - cost))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty
            title="Здесь будет история вкусов"
            text="Выберите другой период или запишите первую продажу."
          />
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Расход ингредиентов</h2>
            <p>Алкоголь и миксеры в коктейлях плюс продажи в розлив</p>
          </div>
        </div>
        <div className="consumption-grid">
          {Object.entries(consumed).map(([id, ml]) => (
            <div key={id}>
              <span>{data.alcohol.find((a) => a.id === id)?.name}</span>
              <strong>{ingredientVolume(data, id, round(ml))}</strong>
            </div>
          ))}
        </div>
        {!Object.keys(consumed).length && <p className="muted">Списаний за выбранный период нет.</p>}
      </section>
      <p className="page-footnote">
        Валовая прибыль учитывает только стоимость ингредиентов. Аренда, зарплата, налоги и прочие расходы
        сюда не входят. Отменённые продажи исключены из итогов; в выгрузке сохранён их статус.
      </p>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney as money } from '../../display-money';
import type { ReportPeriod } from '../../domain/reports/period';
import { priceAdvice, salesPerformance } from '../../domain/reports/pricing';
import { t } from '../../i18n/runtime';
import { useBar } from '../../store';
export function ReportPerformance({ period }: { period: ReportPeriod }) {
  const { data } = useBar();
  const [ranking, setRanking] = useState('revenue');
  const [unit, setUnit] = useState('порц.');
  const [margin, setMargin] = useState(50);
  const rows = useMemo(() => salesPerformance(data, period), [data, period]);
  const advice = useMemo(() => priceAdvice(rows, margin), [rows, margin]);
  const ranked = useMemo(
    () =>
      rows
        .filter(
          (row) => (ranking !== 'quantity' || row.unit === unit) && (ranking !== 'profit' || row.costKnown),
        )
        .sort((a, b) =>
          ranking === 'profit'
            ? b.profit - a.profit
            : ranking === 'quantity'
              ? b.quantity - a.quantity
              : b.revenue - a.revenue,
        )
        .slice(0, 10),
    [rows, ranking, unit],
  );
  const value = (row: (typeof rows)[number]) =>
    ranking === 'profit' ? row.profit : ranking === 'quantity' ? row.quantity : row.revenue;
  const max = Math.max(1, ...ranked.map(value));
  return (
    <>
      <section className="panel performance-panel">
        <div className="section-title">
          <div>
            <h2>{t('Лидеры продаж')}</h2>
            <p>{t('Сравнивайте количество, выручку и валовую прибыль')}</p>
          </div>
          <label className="catalog-sort">
            <select
              aria-label={t('Показатель рейтинга')}
              value={ranking}
              onChange={(e) => setRanking(e.target.value)}
            >
              <option value="revenue">{t('По выручке')}</option>
              <option value="profit">{t('По валовой прибыли')}</option>
              <option value="quantity">{t('По количеству')}</option>
            </select>
          </label>
        </div>
        {ranking === 'quantity' && (
          <div className="segmented">
            {['порц.', 'бут.', 'бок.', '50 мл'].map((label) => (
              <button key={label} className={unit === label ? 'active' : ''} onClick={() => setUnit(label)}>
                {t(label)}
              </button>
            ))}
          </div>
        )}
        <div className="performance-ranking">
          {ranked.map((row, index) => (
            <div className="ranking-row" key={row.id}>
              <span className="ranking-index">{index + 1}</span>
              <div className="ranking-product">
                <strong>
                  {row.name}
                  {row.servingMl ? ` · ${row.servingMl} ${t('мл')}` : ''}
                </strong>
                <div className="ranking-track">
                  <i style={{ width: `${(Math.max(0, value(row)) / max) * 100}%` }} />
                </div>
              </div>
              <strong>
                {ranking === 'quantity'
                  ? `${row.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t(row.unit)}`
                  : money(value(row))}
              </strong>
            </div>
          ))}
        </div>
        {!ranked.length && <p className="muted">{t('Недостаточно данных для этого рейтинга.')}</p>}
        {ranking === 'profit' && (
          <p className="muted">
            {t('В рейтинге прибыли только позиции с заполненной себестоимостью всех продаж.')}
          </p>
        )}
      </section>
      <section className="panel price-advice-panel">
        <div className="section-title">
          <div>
            <h2>{t('Рекомендации по ценам')}</h2>
            <p>{t('Сценарии для проверки, без автоматического изменения цен')}</p>
          </div>
          <label className="catalog-sort">
            <span>{t('Целевая маржа')}</span>
            <select
              aria-label={t('Целевая маржа')}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
            >
              {[30, 40, 50, 60, 70].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          {t(
            'Цель 50% задана как начальный ориентир. Выберите подходящее значение для вашего бара. История продаж не показывает, как гости отреагируют на новую цену.',
          )}
        </p>
        {advice.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Напиток')}</th>
                  <th>{t('Операций')}</th>
                  <th>{t('Средняя цена продажи')}</th>
                  <th>{t('Текущая цена')}</th>
                  <th>{t('Вариант для проверки')}</th>
                  <th>{t('Почему')}</th>
                </tr>
              </thead>
              <tbody>
                {advice
                  .sort(
                    (a, b) =>
                      Number(b.suggested !== null) - Number(a.suggested !== null) ||
                      b.product.revenue - a.product.revenue,
                  )
                  .map((item) => (
                    <tr key={item.product.id}>
                      <td>
                        <strong>{item.product.name}</strong>
                        <small className="table-subtitle">
                          {t(item.product.unit)}
                          {item.product.servingMl ? ` · ${item.product.servingMl} ${t('мл')}` : ''}
                        </small>
                      </td>
                      <td>{item.product.operations}</td>
                      <td>{money(item.product.averagePrice)}</td>
                      <td>{item.product.currentPrice === null ? '—' : money(item.product.currentPrice)}</td>
                      <td>
                        <strong>{item.suggested === null ? '—' : money(item.suggested)}</strong>
                        <small className="table-subtitle">
                          {t(
                            item.kind === 'raise'
                              ? 'Тест повышения'
                              : item.kind === 'lower'
                                ? 'Тест снижения'
                                : item.kind === 'insufficient'
                                  ? 'Мало данных'
                                  : 'Проверить',
                          )}
                        </small>
                      </td>
                      <td className="price-reason">{t(item.reason)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t('Рекомендации появятся после продаж в выбранном периоде.')}</p>
        )}
        <p className="muted">
          {t(
            'Средняя цена рассчитана по фактическим продажам. Стоимость и цены бокалов сравниваются для одинакового объёма. После теста сравните количество продаж и валовую прибыль при сопоставимой доступности напитка.',
          )}
        </p>
        <Link className="button secondary" to="/cocktails">
          {t('Открыть меню и цены')} ↗
        </Link>
      </section>
    </>
  );
}

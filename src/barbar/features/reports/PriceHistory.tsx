import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBar } from '../../app/providers/BarProvider';
import type { PriceChangeRow } from '../../domain/reports/price-history-types';
import type { WindowStats } from '../../domain/reports/price-history';
import { snapshotRead } from '../../services/api-client';
import { formatMoney } from '../../presentation/currency/format-money';
import { locale, t } from '../../presentation/i18n/runtime';
import { LoadingStatus } from '../../ui/loading';

const quantity = (n: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(n);
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function Windows({ change }: { change: PriceChangeRow }) {
  const windows = change.windows;
  if (!windows)
    return (
      <p className="muted">
        {t(
          'Недостаточно данных для сравнения: изменение свежее или рядом с другим изменением цены этой позиции.',
        )}
      </p>
    );
  const rows: [string, (w: WindowStats) => string][] = [
    ['Период', (w) => `${dateLabel(w.from)} — ${dateLabel(w.to)}`],
    ['Дней с продажами', (w) => `${w.salesDays} / ${w.days}`],
    ['Рабочих дней бара', (w) => (w.workedDays === null ? '—' : String(w.workedDays))],
    [
      'Дней в наличии',
      (w) => (w.availableDays === null ? '—' : `${w.availableDays} / ${w.workedDays ?? '—'}`),
    ],
    ['Порции', (w) => quantity(w.units)],
    ['Выручка', (w) => formatMoney(w.revenue)],
    ['Себестоимость', (w) => formatMoney(w.cost)],
    ['Валовая прибыль', (w) => formatMoney(w.grossProfit)],
    ['Средняя цена продажи', (w) => (w.averagePrice === null ? '—' : formatMoney(w.averagePrice))],
  ];
  return (
    <div className="table-scroll">
      <table className="data-table comparison-table" aria-label={t('Продажи до и после изменения цены')}>
        <thead>
          <tr>
            <th>
              {t('Окно')}: {windows.length} {t('дн.')}
            </th>
            <th>{t('До')}</th>
            <th>{t('После')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{t(label)}</td>
              <td>{value(windows.before)}</td>
              <td>{value(windows.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Saved price changes, newest first, each with the sales and gross profit of equal windows before and
 * after it. It records what happened; it never changes a price, and it does not prove the price was the cause.
 */
export function PriceHistory({ product }: { product?: { kind: 'cocktail' | 'alcohol'; id: string } }) {
  const { data } = useBar();
  const query = new URLSearchParams({
    limit: '30',
    ...(product ? { kind: product.kind, productId: product.id } : {}),
  });
  const path = `/api/barbar/prices?${query}` as const;
  const [state, setState] = useState<{
    path: string;
    changes?: PriceChangeRow[];
    since?: string | null;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void snapshotRead(data, path)
      .then((r) => active && setState({ path, changes: r.changes, since: r.trackingSince }))
      .catch((e) => active && setState({ path, error: e instanceof Error ? e.message : 'Ошибка' }));
    return () => {
      active = false;
    };
  }, [data, path]);
  const current = state?.path === path ? state : null;
  return (
    <section className="panel price-history" id="price-history">
      <h2>{t('История цен')}</h2>
      <p className="muted">
        {t(
          'Изменение цены записывается с датой, старой и новой ценой. Окна до и после одинаковой длины (до 14 дней) не включают день изменения. Цены автоматически не меняются. Сравнение не доказывает, что причина — цена.',
        )}
      </p>
      {current?.since && (
        <p className="muted">
          {t('История ведётся с')} {dateLabel(current.since)}: {t('более ранние цены не сохранялись.')}
        </p>
      )}
      {product && (
        <Link className="text-link" to="/reports">
          {t('Показать все позиции')}
        </Link>
      )}
      {!current && <LoadingStatus label="Загружаем историю цен…" />}
      {current?.error && <p role="alert">{t(current.error)}</p>}
      {current?.changes?.map((change) => (
        <details key={change.id} className="price-change">
          <summary>
            <span>{dateLabel(change.date)}</span>
            <strong>{change.name}</strong>
            <span>
              {formatMoney(change.from)} → {formatMoney(change.to)}
              {change.field === 'pricePerLiter' && ` ${t('за 1 000 мл')}`}
            </span>
            {change.actor && <small>{change.actor.fullName}</small>}
          </summary>
          <Windows change={change} />
        </details>
      ))}
      {current?.changes && !current.changes.length && (
        <p className="muted">{t('Изменений цен пока не записано.')}</p>
      )}
    </section>
  );
}

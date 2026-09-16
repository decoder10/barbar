import { useHistory } from '../features/sales/use-history';
import { Pagination } from '../ui/pagination';
import { useState } from 'react';
import { useBar } from '../app/providers/BarProvider';
import { PageHeading } from '../ui/layout';
import {
  OperationForm,
  expenseCategories,
  type OperationKind,
  type OperationPrefill,
} from '../features/operations/OperationForm';
import { useBatches } from '../features/operations/use-batches';
import { batchStatus } from '../domain/batches';
import { businessToday } from '../domain/business-day';
import { formatMoney } from '../presentation/currency/format-money';
import { byId } from '../domain/lookup';
import { unitLabel } from '../domain/model';
import { t } from '../presentation/i18n/runtime';
const labels = {
  count: 'Инвентаризация',
  writeoff: 'Списание',
  prepare: 'Заготовка',
  expense: 'Расход бара',
};
export default function Operations() {
  const { data, run, busy } = useBar();
  const movements = useHistory<import('../domain/types').StockMovement>(
    'stockMovements',
    '1900-01-01',
    '9999-12-31',
  );
  const expenses = useHistory<import('../domain/types').BarExpense>('expenses', '1900-01-01', '9999-12-31');
  const stockMovements = movements.enabled ? movements.rows : data.stockMovements || [];
  const barExpenses = expenses.enabled ? expenses.rows : data.expenses || [];
  const [form, setForm] = useState<OperationKind | null>(null);
  const [prefill, setPrefill] = useState<OperationPrefill | undefined>();
  const batches = useBatches();
  const today = businessToday();
  const alcoholById = byId(data.alcohol);
  const quantity = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
  const statusLabel = { expired: 'Просрочена', soon: 'Скоро истекает', ok: 'В норме', none: 'Без срока' };
  return (
    <>
      <PageHeading
        eyebrow="УЧЁТ БАРА"
        title={t('Операции склада и расходы')}
        description="Пересчёт остатков, списания, выпуск заготовок и текущие расходы."
      />
      <div className="operation-toolbar">
        {(Object.keys(labels) as OperationKind[]).map((kind) => (
          <button
            key={kind}
            className="button secondary"
            onClick={() => {
              setPrefill(undefined);
              setForm(kind);
            }}
          >
            {t(labels[kind])}
          </button>
        ))}
      </div>
      <section className="panel">
        <h2>{t('Складские операции')}</h2>
        <Pagination page={movements} />
        <div className="table-scroll">
          <table className="data-table operations-table">
            <thead>
              <tr>
                <th>{t('Дата')}</th>
                <th>{t('Операция')}</th>
                <th>{t('Причина / партия')}</th>
                <th>{t('Изменение остатка')}</th>
                <th>{t('Стоимость изменения')}</th>
              </tr>
            </thead>
            <tbody>
              {(movements.enabled ? stockMovements : [...stockMovements].reverse()).map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.date}
                    {m.expiresOn && (
                      <small>
                        {t('Годен до')}: {m.expiresOn}
                      </small>
                    )}
                  </td>
                  <td>{t(labels[m.kind])}</td>
                  <td>{m.reason}</td>
                  <td>
                    {m.lines.map((l, index) => {
                      const a = alcoholById.get(l.alcoholId);
                      return (
                        <div key={index}>
                          {a?.name}: {l.ml > 0 ? '+' : ''}
                          {l.ml} {unitLabel(a?.unit)}
                        </div>
                      );
                    })}
                    {m.counted?.length && !m.lines.length ? t('Остаток подтверждён, расхождений нет.') : null}
                  </td>
                  <td>
                    {formatMoney(
                      m.kind === 'prepare'
                        ? m.lines.find((l) => l.alcoholId === m.outputId)?.cost || 0
                        : m.lines.reduce((sum, l) => sum + l.cost, 0),
                    )}
                    {m.kind === 'prepare' && <small>{t('Себестоимость партии')}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!stockMovements.length && <p className="muted">{t('Операций пока нет.')}</p>}
        </div>
      </section>
      <section className="panel">
        <h2>{t('Партии заготовок')}</h2>
        <p className="muted">
          {t(
            'Остаток по партиям рассчитан по FEFO: первой расходуется партия с ближайшим сроком годности. Себестоимость в учёте остаётся средневзвешенной.',
          )}
        </p>
        {batches.error && <p role="alert">{t(batches.error)}</p>}
        {batches.loading ? (
          <p className="muted" role="status">
            {t('Загружаем партии…')}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table operations-table batches-table">
              <thead>
                <tr>
                  <th>{t('Заготовка')}</th>
                  <th>{t('Партия')}</th>
                  <th>{t('Выпуск')}</th>
                  <th>{t('Годен до')}</th>
                  <th>{t('Остаток')}</th>
                  <th>{t('Статус')}</th>
                  <th>{t('Действия')}</th>
                </tr>
              </thead>
              <tbody>
                {batches.batches.flatMap((item) => {
                  const product = alcoholById.get(item.outputId);
                  const unit = unitLabel(product?.unit);
                  return [
                    ...item.batches.map((b) => {
                      const status = batchStatus(b, today);
                      return (
                        <tr key={b.id} className={`batch-${status}`}>
                          <td>{product?.name || item.outputId}</td>
                          <td>{b.reason}</td>
                          <td>{b.date}</td>
                          <td>{b.expiresOn || '—'}</td>
                          <td>
                            {quantity(b.remaining)} / {quantity(b.produced)} {t(unit)}
                          </td>
                          <td>
                            <span className={`batch-status ${status}`}>{t(statusLabel[status])}</span>
                          </td>
                          <td>
                            {(status === 'expired' || status === 'soon') && (
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => {
                                  setPrefill({
                                    productId: item.outputId,
                                    amount: String(b.remaining),
                                    reason: `Срок партии «${b.reason}» до ${b.expiresOn}`,
                                  });
                                  setForm('writeoff');
                                }}
                              >
                                {t('Списать')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                    ...(item.unassigned > 0
                      ? [
                          <tr key={`${item.outputId}-unassigned`}>
                            <td>{product?.name || item.outputId}</td>
                            <td>{t('Без партии (закупка или излишек)')}</td>
                            <td>—</td>
                            <td>—</td>
                            <td>
                              {quantity(item.unassigned)} {t(unit)}
                            </td>
                            <td>—</td>
                            <td />
                          </tr>,
                        ]
                      : []),
                  ];
                })}
              </tbody>
            </table>
            {!batches.batches.length && <p className="muted">{t('Готовых заготовок с остатком нет.')}</p>}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>{t('Расходы бара')}</h2>
        <Pagination page={expenses} />
        <p className="muted">
          {t(
            'Закупки не включайте повторно. Расходы уменьшают операционный результат, но не себестоимость напитков.',
          )}
        </p>
        <div className="table-scroll">
          <table className="data-table operations-table">
            <thead>
              <tr>
                <th>{t('Дата')}</th>
                <th>{t('Категория')}</th>
                <th>{t('Описание')}</th>
                <th>{t('Сумма')}</th>
                <th>{t('Действия')}</th>
              </tr>
            </thead>
            <tbody>
              {(expenses.enabled ? barExpenses : [...barExpenses].reverse()).map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{t(expenseCategories[e.category])}</td>
                  <td>{e.description}</td>
                  <td>{formatMoney(e.amount)}</td>
                  <td>
                    {e.voided ? (
                      t('Отменён')
                    ) : (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => {
                          void run({ type: 'voidExpense', expenseId: e.id }, 'Расход отменён.');
                        }}
                      >
                        {t('Отменить расход')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {form && <OperationForm kind={form} prefill={prefill} close={() => setForm(null)} />}
    </>
  );
}

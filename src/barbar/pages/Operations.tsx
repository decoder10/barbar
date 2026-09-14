import { useHistory } from '../features/sales/use-history';
import { Pagination } from '../ui/pagination';
import { useState } from 'react';
import { useBar } from '../app/providers/BarProvider';
import { PageHeading } from '../ui/layout';
import { OperationForm, expenseCategories, type OperationKind } from '../features/operations/OperationForm';
import { formatMoney } from '../presentation/currency/format-money';
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
  return (
    <>
      <PageHeading
        eyebrow="УЧЁТ БАРА"
        title={t('Операции склада и расходы')}
        description="Пересчёт остатков, списания, выпуск заготовок и текущие расходы."
      />
      <div className="operation-toolbar">
        {(Object.keys(labels) as OperationKind[]).map((kind) => (
          <button key={kind} className="button secondary" onClick={() => setForm(kind)}>
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
                      const a = data.alcohol.find((a) => a.id === l.alcoholId);
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
      {form && <OperationForm kind={form} close={() => setForm(null)} />}
    </>
  );
}

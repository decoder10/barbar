import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { averageCost, stock, unitLabel, priceUnit } from '../../domain/model';
import { businessToday } from '../../domain/business-day';
import { t } from '../../presentation/i18n/runtime';
export type OperationKind = 'count' | 'writeoff' | 'prepare' | 'expense';
export const expenseCategories = {
  rent: 'Аренда',
  payroll: 'Оплата труда',
  utilities: 'Коммунальные услуги',
  marketing: 'Реклама',
  maintenance: 'Обслуживание',
  other: 'Прочее',
};
export function OperationForm({ kind, close }: { kind: OperationKind; close: () => void }) {
  const { data, run } = useBar();
  const [productId, setProductId] = useState(data.alcohol[0]?.id || '');
  const [expected, setExpected] = useState(() => stock(data, productId));
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState(() => String(averageCost(data, productId)));
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(businessToday);
  const [expires, setExpires] = useState('');
  const [category, setCategory] = useState<keyof typeof expenseCategories>('other');
  const [ingredients, setIngredients] = useState([{ alcoholId: '', ml: '' }]);
  const product = data.alcohol.find((a) => a.id === productId);
  const pick = (id: string) => {
    setProductId(id);
    setExpected(stock(data, id));
    setCost(String(averageCost(data, id)));
  };
  const options = data.alcohol.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} · {unitLabel(a.unit)}
    </option>
  ));
  return (
    <Modal
      title={t(
        {
          count: 'Инвентаризация',
          writeoff: 'Списать со склада',
          prepare: 'Выпуск заготовки',
          expense: 'Расход бара',
        }[kind],
      )}
      subtitle={
        kind === 'expense'
          ? 'Закупки сюда не вносите: они учитываются отдельно.'
          : 'Операция сохранится в журнале с текущим барным днём.'
      }
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const action =
            kind === 'expense'
              ? {
                  type: 'expense' as const,
                  value: { date, category, description: reason, amount: Number(amount) },
                }
              : kind === 'count'
                ? {
                    type: 'count' as const,
                    reason,
                    lines: [
                      { alcoholId: productId, expected, actual: Number(amount), costPerBasis: Number(cost) },
                    ],
                  }
                : kind === 'writeoff'
                  ? {
                      type: 'writeoff' as const,
                      reason,
                      alcoholId: productId,
                      quantity: Number(amount),
                      expected,
                    }
                  : {
                      type: 'prepare' as const,
                      reason,
                      outputId: productId,
                      quantity: Number(amount),
                      ingredients: ingredients.map((i) => ({ alcoholId: i.alcoholId, ml: Number(i.ml) })),
                      ...(expires ? { expiresOn: expires } : {}),
                    };
          if (await run(action, 'Операция сохранена.')) close();
        }}
      >
        {kind !== 'expense' && (
          <Field
            label={kind === 'prepare' ? 'Готовая заготовка на складе' : 'Позиция'}
            hint={
              kind === 'prepare'
                ? 'Сначала создайте для заготовки отдельную позицию склада. Используйте её в рецептах.'
                : `Учётный остаток: ${expected} ${unitLabel(product?.unit)}`
            }
          >
            <select value={productId} onChange={(e) => pick(e.target.value)} required>
              {options}
            </select>
          </Field>
        )}
        <Field
          label={
            kind === 'expense'
              ? 'Сумма, ֏'
              : `${kind === 'count' ? 'Фактический остаток' : kind === 'prepare' ? 'Выход партии' : 'Количество'}, ${unitLabel(product?.unit)}`
          }
        >
          <input
            type="number"
            step="any"
            min={kind === 'count' ? 0 : 0.01}
            max="1000000000"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        {kind === 'count' && (
          <>
            <p>
              {t('Расхождение')}: {Number(amount) - expected} {unitLabel(product?.unit)}
            </p>
            {Number(amount) > expected && (
              <Field label={`Стоимость излишка за ${priceUnit(product?.unit)}, ֏`}>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </Field>
            )}
          </>
        )}
        {kind === 'prepare' && (
          <>
            <h3>{t('Ингредиенты на всю партию')}</h3>
            {ingredients.map((i, index) => (
              <div className="form-grid" key={index}>
                <Field label="Ингредиент">
                  <select
                    required
                    value={i.alcoholId}
                    onChange={(e) =>
                      setIngredients((current) =>
                        current.map((row, n) => (n === index ? { ...row, alcoholId: e.target.value } : row)),
                      )
                    }
                  >
                    <option value="">{t('Выберите')}</option>
                    {options}
                  </select>
                </Field>
                <Field
                  label={`Количество, ${unitLabel(data.alcohol.find((a) => a.id === i.alcoholId)?.unit)}`}
                >
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={i.ml}
                    onChange={(e) =>
                      setIngredients((current) =>
                        current.map((row, n) => (n === index ? { ...row, ml: e.target.value } : row)),
                      )
                    }
                  />
                </Field>
                <button
                  type="button"
                  className="button secondary"
                  disabled={ingredients.length === 1}
                  onClick={() => setIngredients((current) => current.filter((_, n) => n !== index))}
                >
                  {t('Убрать')}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              disabled={ingredients.length >= 30}
              onClick={() => setIngredients((current) => [...current, { alcoholId: '', ml: '' }])}
            >
              {t('Добавить ингредиент')}
            </button>
            <Field label="Годен до (необязательно)">
              <input
                type="date"
                min={businessToday()}
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
          </>
        )}
        {kind === 'expense' && (
          <div className="form-grid">
            <Field label="Категория">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as keyof typeof expenseCategories)}
              >
                {Object.entries(expenseCategories).map(([id, name]) => (
                  <option key={id} value={id}>
                    {t(name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дата">
              <input
                type="date"
                max={businessToday()}
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
        )}
        <Field
          label={
            kind === 'prepare'
              ? 'Название партии / примечание'
              : kind === 'expense'
                ? 'Описание расхода'
                : 'Причина / комментарий'
          }
        >
          <input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Submit>{t('Сохранить операцию')}</Submit>
      </form>
    </Modal>
  );
}

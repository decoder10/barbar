import { Plus, Trash2 } from 'lucide-react';
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
export interface OperationPrefill {
  productId: string;
  amount: string;
  reason: string;
}
export function OperationForm({
  kind,
  close,
  prefill,
}: {
  kind: OperationKind;
  close: () => void;
  prefill?: OperationPrefill;
}) {
  const { data, run } = useBar();
  const [productId, setProductId] = useState(prefill?.productId || data.alcohol[0]?.id || '');
  const [expected, setExpected] = useState(() => stock(data, productId));
  const [amount, setAmount] = useState(prefill?.amount || '');
  const [cost, setCost] = useState(() => String(averageCost(data, productId)));
  const [reason, setReason] = useState(prefill?.reason || '');
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
          hint={kind === 'prepare' ? 'Сколько готовой заготовки получилось' : undefined}
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
          <section className="batch-ingredients">
            <div className="ingredient-label">
              <span>{t('Ингредиенты на всю партию')}</span>
              <small>{t('Спишутся со склада, их стоимость перейдёт в партию')}</small>
            </div>
            {ingredients.map((i, index) => {
              const unit = unitLabel(data.alcohol.find((a) => a.id === i.alcoholId)?.unit);
              return (
                <div className="ingredient-inputs" key={index}>
                  <select
                    aria-label={t(`Ингредиент ${index + 1}`)}
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
                  <label>
                    <input
                      aria-label={t(`Количество ингредиента ${index + 1}, ${unit}`)}
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      placeholder="0"
                      value={i.ml}
                      onChange={(e) =>
                        setIngredients((current) =>
                          current.map((row, n) => (n === index ? { ...row, ml: e.target.value } : row)),
                        )
                      }
                    />
                    <span>{t(unit)}</span>
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t(`Убрать ингредиент ${index + 1}`)}
                    title={t('Убрать')}
                    disabled={ingredients.length === 1}
                    onClick={() => setIngredients((current) => current.filter((_, n) => n !== index))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="text-link add-ingredient"
              disabled={ingredients.length >= 30 || ingredients.some((i) => !i.alcoholId)}
              onClick={() => setIngredients((current) => [...current, { alcoholId: '', ml: '' }])}
            >
              <Plus size={15} />
              {t(' Добавить ингредиент')}
            </button>
          </section>
        )}
        {kind === 'prepare' && (
          <div className="form-grid">
            <Field label="Годен до" hint="Необязательно">
              <input
                type="date"
                min={businessToday()}
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
            <Field label="Название партии" hint="Например: партия 12.09">
              <input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
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
        {kind !== 'prepare' && (
          <Field label={kind === 'expense' ? 'Описание расхода' : 'Причина / комментарий'}>
            <input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <Submit>{t('Сохранить операцию')}</Submit>
      </form>
    </Modal>
  );
}

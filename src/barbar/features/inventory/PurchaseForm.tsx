import { useInventoryCalculations } from './use-inventory-calculations';
import { useState } from 'react';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { businessDayHint } from '../../domain/business-day';
import {
  ingredientUnit,
  ingredientVolume,
  priceBasis,
  priceUnit,
  round,
  today,
  uid,
} from '../../domain/model';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';
import { useBusinessDate } from '../sales/use-business-date';

export function PurchaseForm({ alcoholId, close }: { alcoholId?: string; close: () => void }) {
  const { data, run } = useBar();
  const inventory = useInventoryCalculations(data);
  const selected = data.alcohol.find((a) => a.id === alcoholId) || data.alcohol[0];
  const [id] = useState(uid);
  const [drinkId, setDrinkId] = useState(selected?.id || '');
  const [ml, setMl] = useState(selected?.unit === 'bottle' ? '1' : '1000');
  const [cost, setCost] = useState(String(selected?.costPerLiter || ''));
  const [date, setDate] = useBusinessDate();
  const drink = data.alcohol.find((a) => a.id === drinkId);
  const bottled = drink?.unit === 'bottle';
  return (
    <Modal
      title={t('Добавить закупку')}
      subtitle="Количество прибавится к остатку выбранной марки."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              {
                type: 'purchase',
                value: { id, alcoholId: drinkId, ml: Number(ml), costPerLiter: Number(cost), date },
              },
              'Закупка добавлена. Склад пополнен.',
            )
          ) {
            close();
          }
        }}
      >
        <Field label="Напиток">
          <select
            required
            value={drinkId}
            onChange={(e) => {
              setDrinkId(e.target.value);
              setMl(data.alcohol.find((a) => a.id === e.target.value)?.unit === 'bottle' ? '1' : '1000');
              setCost(String(data.alcohol.find((a) => a.id === e.target.value)?.costPerLiter || ''));
            }}
          >
            {t(
              data.alcohol.map((a) => (
                <option key={a.id} value={a.id}>
                  {t(a.name)}
                </option>
              )),
            )}
          </select>
        </Field>
        <div className="form-grid">
          <Field label={`Количество, ${ingredientUnit(data, drinkId)}`}>
            <input
              required
              type="number"
              min={bottled ? 1 : 0.01}
              max="1000000000"
              step={bottled ? 1 : 0.01}
              value={ml}
              onChange={(e) => setMl(e.target.value)}
            />
          </Field>
          <Field label={`Цена за ${priceUnit(drink?.unit)}, ֏`}>
            <input
              required
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              value={cost}
              placeholder={t('Закупочная цена')}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
        </div>
        <div className="quick-values">
          {t(
            (bottled ? [1, 6, 12, 24, 48] : [500, 700, 1000, 2000, 5000]).map((n) => (
              <button
                type="button"
                key={n}
                className={Number(ml) === n ? 'selected' : ''}
                onClick={() => setMl(String(n))}
              >
                {t(n)} {t(ingredientUnit(data, drinkId))}
              </button>
            )),
          )}
        </div>
        <Field label="Дата закупки" hint={businessDayHint}>
          <input required type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="form-total">
          <span>
            {t('Стоимость закупки')}
            <strong>{t(money(round((Number(ml) * Number(cost)) / priceBasis(data, drinkId))))}</strong>
          </span>
          <small>
            {t('На складе станет: ')}
            {t(ingredientVolume(data, drinkId, inventory.stock(drinkId) + Number(ml)))}
          </small>
        </div>
        <Submit>{t('Добавить на склад')}</Submit>
      </form>
    </Modal>
  );
}

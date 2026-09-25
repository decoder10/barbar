import { useInventoryCalculations } from './use-inventory-calculations';
import { useState } from 'react';
import { Field } from '../../ui/fields';
import { DatePicker } from '../../ui/date-picker';
import { Modal, Submit } from '../../ui/modal';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { businessDayHint } from '../../domain/business-day';
import { packPriceUnit, priceAmount, toShownPrice, toStoredPrice } from '../../domain/catalog/pack-price';
import {
  ingredientUnit,
  ingredientVolume,
  priceBasis,
  round,
  today,
  uid,
  unitBasis,
} from '../../domain/model';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';
import { barConfig } from '../../config';

const quickAmounts = barConfig.presets.purchaseQuickAmounts;
import { useBusinessDate } from '../sales/use-business-date';

export function PurchaseForm({ alcoholId, close }: { alcoholId?: string; close: () => void }) {
  const { data, run } = useBar();
  const inventory = useInventoryCalculations(data);
  const selected = data.alcohol.find((a) => a.id === alcoholId) || data.alcohol[0];
  const [id] = useState(uid);
  const [drinkId, setDrinkId] = useState(selected?.id || '');
  // One package by default; its price is entered as the owner buys it (700 ֏ for 500 ml).
  const [ml, setMl] = useState(String(priceAmount(selected)));
  const [cost, setCost] = useState(String((selected && toShownPrice(selected.costPerLiter, selected)) || ''));
  const [date, setDate] = useBusinessDate();
  const drink = data.alcohol.find((a) => a.id === drinkId);
  const bottled = unitBasis(drink?.unit) === 1;
  const pack = priceAmount(drink);
  const storedCost = toStoredPrice(Number(cost), drink);
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
                value: { id, alcoholId: drinkId, ml: Number(ml), costPerLiter: storedCost, date },
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
              const next = data.alcohol.find((a) => a.id === e.target.value);
              setDrinkId(e.target.value);
              setMl(String(priceAmount(next)));
              setCost(String((next && toShownPrice(next.costPerLiter, next)) || ''));
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
          <Field label={`Цена за ${packPriceUnit(drink)}, ֏`}>
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
            (pack !== unitBasis(drink?.unit)
              ? quickAmounts.packs.map((n) => n * pack)
              : drink?.unit === 'pcs'
                ? quickAmounts.pcs
                : bottled
                  ? quickAmounts.bottle
                  : quickAmounts.volume
            ).map((n) => (
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
          <DatePicker
            label="Дата закупки"
            value={date}
            max={today()}
            onChange={(value) => {
              if (value) setDate(value);
            }}
          />
        </Field>
        <div className="form-total">
          <span>
            {t('Стоимость закупки')}
            <strong>{t(money(round((Number(ml) * storedCost) / priceBasis(data, drinkId))))}</strong>
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

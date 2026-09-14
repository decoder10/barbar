import { useInventoryCalculations } from './use-inventory-calculations';
import { useState } from 'react';
import { Field } from '../../ui/fields';
import { Modal } from '../../ui/modal';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { ingredientUnit, ingredientVolume, priceBasis, round } from '../../domain/model';
import type { Purchase } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';

export function CorrectPurchaseForm({ purchase, close }: { purchase: Purchase; close: () => void }) {
  const { data, run, busy } = useBar();
  const inventory = useInventoryCalculations(data);
  const [amount, setAmount] = useState(String(purchase.ml));
  const [remove, setRemove] = useState(false);
  const [confirm, setConfirm] = useState('');
  const drink = data.alcohol.find((a) => a.id === purchase.alcoholId);
  const nextMl = remove ? 0 : Number(amount);
  const difference = round(nextMl - purchase.ml);
  return (
    <Modal title={t(`Исправить закупку «${drink?.name}»`)} close={close}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (remove && confirm.trim().toUpperCase() !== 'УДАЛИТЬ') return;
          if (
            await run(
              { type: 'correctPurchase', purchaseId: purchase.id, expectedMl: purchase.ml, ml: nextMl },
              remove ? 'Ошибочная закупка удалена.' : 'Количество в закупке исправлено.',
            )
          )
            close();
        }}
      >
        <p className="form-help">
          {t('Укажите фактически купленное количество. Остаток и сумма закупки пересчитаются.')}
        </p>
        <Field label={`Правильное количество, ${ingredientUnit(data, purchase.alcoholId)}`}>
          <input
            type="number"
            required
            min={drink?.unit === 'bottle' ? 1 : 0.01}
            max="1000000000"
            step={drink?.unit === 'bottle' ? 1 : 0.01}
            disabled={remove}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <label className="form-help">
          <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
          {t(' Закупки не было — удалить запись целиком')}
        </label>
        <div className="form-total">
          <span>
            {t('Изменение остатка')}
            <strong>
              {t(difference > 0 ? '+' : '')}
              {t(ingredientVolume(data, purchase.alcoholId, difference))}
            </strong>
          </span>
          <small>
            {t('На складе станет:')}
            {t(' ')}
            {t(ingredientVolume(data, purchase.alcoholId, inventory.stock(purchase.alcoholId) + difference))}
          </small>
          <small>
            {t('Сумма закупки:')}
            {t(' ')}
            {t(money(round((nextMl * purchase.costPerLiter) / priceBasis(data, purchase.alcoholId))))}
          </small>
        </div>
        {t(
          remove && (
            <Field label="Для удаления напишите УДАЛИТЬ">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          ),
        )}
        <div className="reset-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={close}>
            {t('Отмена')}
          </button>
          <button
            className="button danger-button"
            type="submit"
            disabled={busy || difference === 0 || (remove && confirm.trim().toUpperCase() !== 'УДАЛИТЬ')}
          >
            {t(remove ? 'Удалить закупку' : 'Сохранить правильное количество')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

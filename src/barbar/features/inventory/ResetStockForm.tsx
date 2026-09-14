import { useInventoryCalculations } from './use-inventory-calculations';
import { useState } from 'react';
import { Field, Modal } from '../../components';
import { formatMoney as money } from '../../display-money';
import { ingredientVolume, priceBasis, round } from '../../domain/model';
import type { Alcohol } from '../../domain/types';
import { locale, t } from '../../i18n/runtime';
import { useBar } from '../../store';

export function ResetStockForm({ alcohol, close }: { alcohol: Alcohol; close: () => void }) {
  const { data, run, busy } = useBar();
  const inventory = useInventoryCalculations(data);
  const [confirmation, setConfirmation] = useState('');
  const [amount] = useState(() => inventory.stock(alcohol.id));
  const [cost] = useState(() =>
    round((inventory.averageCost(alcohol.id) * amount) / priceBasis(data, alcohol.id)),
  );
  return (
    <Modal
      title={t(`Обнулить остаток «${alcohol.name}»?`)}
      subtitle="Это спишет весь текущий запас выбранного напитка."
      close={close}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (confirmation.trim().toLocaleUpperCase(locale()) !== 'СБРОС') return;
          if (
            await run(
              { type: 'resetStock', alcoholId: alcohol.id, expectedMl: amount, expectedCost: cost },
              `Остаток «${alcohol.name}» обнулён. Списание сохранено.`,
            )
          )
            close();
        }}
      >
        <div className="form-total">
          <span>
            {t('Остаток после сброса')}
            <strong>
              {t(ingredientVolume(data, alcohol.id, amount))} → {t(ingredientVolume(data, alcohol.id, 0))}
            </strong>
          </span>
          <small>
            {t('Стоимость списания:')}
            {t(money(cost))}
          </small>
        </div>
        <p className="form-help">
          {t(
            'Вы подтверждаете, что этого запаса больше нет на складе. Напиток, его цены, рецепты, закупки и прошлые продажи сохранятся. Другие напитки не изменятся. Сброс увидят все устройства. Чтобы снова пополнить запас, добавьте новую закупку.',
          )}
        </p>
        <Field
          label="Для подтверждения напишите СБРОС"
          hint="Передумали? Нажмите «Отмена» — ничего не изменится."
        >
          <input autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </Field>
        <div className="reset-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={close}>
            {t('Отмена')}
          </button>
          <button
            type="submit"
            className="button danger-button"
            disabled={busy || confirmation.trim().toLocaleUpperCase(locale()) !== 'СБРОС'}
          >
            {t(busy ? 'Списываем…' : 'Да, обнулить остаток')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

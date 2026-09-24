import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import type { PreparationBatch } from '../../domain/batches';
import { unitLabel } from '../../domain/model';
import { formatMoney } from '../../presentation/currency/format-money';
import { t } from '../../presentation/i18n/runtime';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';

/**
 * Corrects the actual yield of an untouched batch. The batch keeps its cost, so the cost of one unit
 * follows the new yield; a batch that has been used or written off cannot be corrected.
 */
export function BatchYieldForm({
  batch,
  unit,
  close,
}: {
  batch: PreparationBatch;
  unit?: 'ml' | 'g' | 'bottle' | 'pcs';
  close: () => void;
}) {
  const { run } = useBar();
  const [actual, setActual] = useState(String(batch.produced));
  const [reason, setReason] = useState('');
  const value = Number(actual);
  return (
    <Modal title={t('Исправить выход партии')} subtitle={`${batch.reason} · ${batch.date}`} close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              {
                type: 'correctBatchYield',
                batchId: batch.id,
                expected: batch.produced,
                actual: value,
                reason,
              },
              'Выход партии исправлен.',
            )
          )
            close();
        }}
      >
        <p className="muted">
          {t('Записано')}: {batch.produced} {t(unitLabel(unit))} · {t('Стоимость партии')}:{' '}
          {formatMoney(batch.cost)}
        </p>
        <Field
          label={`Фактический выход, ${unitLabel(unit)}`}
          hint="Стоимость партии не меняется, меняется стоимость единицы"
        >
          <input
            type="number"
            step="any"
            min="0.01"
            max="1000000000"
            required
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </Field>
        {value > 0 && (
          <p className="muted">
            {t('Стоимость единицы')}: {formatMoney(batch.cost / value)}
          </p>
        )}
        <Field label="Причина">
          <input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Submit>{t('Сохранить исправление')}</Submit>
      </form>
    </Modal>
  );
}

import type { ReactNode } from 'react';
import { Field, GlassVolumeField } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { round } from '../../domain/model';
import type { Sale } from '../../domain/types';
import { locale, t } from '../../presentation/i18n/runtime';

/** A drink picked in the catalog: the page resolves the product for its role. */
export interface CatalogSelection {
  kind: Sale['kind'];
  id: string;
}
/** What a sale dialog hands back: the page decides whether it is a standalone sale or a receipt line. */
export interface SaleValue {
  kind: Sale['kind'];
  productId: string;
  quantity: number;
  servingMl?: number;
}
export interface SaleLine {
  id: string;
  name?: string;
  amount: string;
}

/** Quantity field label by what one sale counts. */
export const saleQuantityLabel = (kind: Sale['kind'], unit?: 'bottle' | 'glass' | 'pcs') =>
  unit === 'bottle'
    ? 'Количество бутылок'
    : unit === 'glass'
      ? 'Количество бокалов'
      : unit === 'pcs'
        ? 'Количество штук'
        : kind === 'cocktail'
          ? 'Количество порций'
          : 'Объём продажи, мл';

/**
 * One sale dialog for owner and worker. Money the role may not see (cost, cost-only products) is simply not passed.
 */
export function SaleDialog({
  title,
  date,
  close,
  kind,
  quantity,
  setQuantity,
  quantityLabel,
  quantityHint,
  glass,
  deducted,
  costLines,
  noIngredients,
  total,
  cost,
  notices,
  disabled,
  submit,
}: {
  title: string;
  date: string;
  close: () => void;
  kind: Sale['kind'];
  quantity: string;
  setQuantity: (value: string) => void;
  quantityLabel: string;
  quantityHint?: string;
  glass?: { value: string; onChange: (value: string) => void; max?: number; hint: string; setup?: ReactNode };
  deducted: SaleLine[];
  costLines?: SaleLine[];
  noIngredients?: boolean;
  total: number;
  cost?: number;
  notices?: ReactNode;
  disabled: boolean;
  submit: () => Promise<unknown>;
}) {
  const amount = Number(quantity);
  return (
    <Modal
      title={t(title)}
      subtitle={`Продажа за ${new Date(`${date}T12:00:00`).toLocaleDateString(locale())}`}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await submit();
        }}
      >
        {glass && (
          <GlassVolumeField value={glass.value} onChange={glass.onChange} max={glass.max} hint={glass.hint} />
        )}
        {glass?.setup}
        <Field label={quantityLabel} hint={quantityHint}>
          <input
            type="number"
            min={kind === 'cocktail' ? 1 : 0.01}
            step={kind === 'cocktail' ? 1 : 0.01}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <div className="quick-values">
          {(kind === 'cocktail' ? [1, 2, 3, 5] : [30, 50, 100, 150, 500]).map((n) => (
            <button
              className={amount === n ? 'selected' : ''}
              type="button"
              key={n}
              onClick={() => setQuantity(String(n))}
            >
              {t(n)}
              {t(kind === 'alcohol' ? ' мл' : '')}
            </button>
          ))}
        </div>
        {deducted.length > 0 ? (
          <div className="recipe-breakdown">
            <div className="eyebrow">{t('СПИШЕТСЯ СО СКЛАДА')}</div>
            {deducted.map((line) => (
              <div key={line.id}>
                <span>{t(line.name)}</span>
                <b>{t(line.amount)}</b>
              </div>
            ))}
          </div>
        ) : (
          noIngredients && <p className="form-help">{t('Без ингредиентов: склад не списывается.')}</p>
        )}
        {!!costLines?.length && (
          <div className="recipe-breakdown">
            <div className="eyebrow">{t('ПРОДУКТЫ ПО СТОИМОСТИ · БЕЗ СПИСАНИЯ КОЛИЧЕСТВА')}</div>
            {costLines.map((line) => (
              <div key={line.id}>
                <span>{t(line.name)}</span>
                <b>{t(line.amount)}</b>
              </div>
            ))}
          </div>
        )}
        <div className="form-total">
          <span>
            {t('К оплате')}
            <strong>{t(money(round(Number.isFinite(total) ? total : 0)))}</strong>
          </span>
          {cost !== undefined && (
            <small>
              {t('Себестоимость: ')}
              {t(money(round(cost)))}
            </small>
          )}
        </div>
        {notices}
        <Submit disabled={disabled}>{t('Записать продажу')}</Submit>
      </form>
    </Modal>
  );
}

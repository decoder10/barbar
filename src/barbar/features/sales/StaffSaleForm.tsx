import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { expandRecipe } from '../../domain/catalog/sets';
import { byId } from '../../domain/lookup';
import { ingredientVolume, round, saleUnit, volume } from '../../domain/model';
import { isGlassServing } from '../../domain/serving';
import type { MenuCategory, StaffProduct } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { SaleDialog, saleQuantityLabel, type CatalogSelection, type SaleValue } from './SaleDialog';

export const staffSaleLabel = (
  n: number,
  item: { kind: string; unit?: StaffProduct['unit']; category?: string },
) =>
  `${n} ${saleUnit({ ...item, category: item.category === 'alcohol' ? undefined : (item.category as MenuCategory) })}`;

/** The worker's sale dialog: the owner's `SaleDialog` without costs, fed from the allowlisted products. */
export function StaffSaleForm({
  selection,
  date,
  close,
  onSubmit,
}: {
  selection: CatalogSelection;
  date: string;
  close: () => void;
  /** Resolves truthy once the sale is recorded; the dialog then closes. */
  onSubmit: (value: SaleValue) => Promise<unknown>;
}) {
  const { staffData } = useBar();
  const [quantity, setQuantity] = useState(selection.kind === 'cocktail' ? '1' : '50');
  const [glassMl, setGlassMl] = useState('');
  // Read on every render: availability can change while the form is open on another device.
  const current = staffData?.products.find((p) => p.id === selection.id && p.kind === selection.kind);
  if (!staffData || !current) return null;
  const recipeById = byId(staffData.recipes);
  const ingredientById = byId(staffData.ingredients);
  const ingredientName = (id: string) => ingredientById.get(id)?.name;
  const amount = Number(quantity);
  const servingMl = Number(glassMl || current.glassSizeMl || 150);
  const glassServing = isGlassServing(current);
  const variableGlass = current.unit === 'glass' && !!current.glassSizeMl && !!current.bottleSizeMl;
  const available =
    variableGlass && current.availableMl !== undefined
      ? Math.floor((current.availableMl + 1e-6) / servingMl)
      : current.available;
  const totalPrice = (current.price || 0) * amount * (variableGlass ? servingMl / current.glassSizeMl! : 1);
  const currentRecipe = current.kind === 'cocktail' ? recipeById.get(current.id) : undefined;
  const deducted =
    variableGlass && current.stockAlcoholId
      ? [{ alcoholId: current.stockAlcoholId, ml: servingMl / current.bottleSizeMl! }]
      : currentRecipe
        ? expandRecipe(currentRecipe, staffData.recipes)
        : [{ alcoholId: current.id, ml: 1 }];
  return (
    <SaleDialog
      title={current.name}
      date={date}
      close={close}
      kind={current.kind}
      quantity={quantity}
      setQuantity={setQuantity}
      quantityLabel={saleQuantityLabel(current.kind, current.unit)}
      quantityHint={
        available === null || available === undefined
          ? 'Продукты учитываются по стоимости, без контроля количества'
          : `Сейчас доступно: ${current.kind === 'cocktail' ? staffSaleLabel(available, current) : volume(available)}`
      }
      glass={
        glassServing
          ? {
              value: String(servingMl),
              onChange: setGlassMl,
              max: current.bottleSizeMl,
              hint: `Стоимость пропорциональна объёму. Спишется: ${Math.round((servingMl || 0) * (amount || 0))} мл.`,
              setup: !variableGlass && (
                <p className="form-warning">
                  {t('Попросите владельца указать объём бутылки и стандартного бокала на складе.')}
                </p>
              ),
            }
          : undefined
      }
      deducted={deducted.map((i) => ({
        id: i.alcoholId,
        name: ingredientName(i.alcoholId),
        amount: ingredientVolume(
          { alcohol: staffData.ingredients },
          i.alcoholId,
          round(i.ml * (amount || 0)),
        ),
      }))}
      noIngredients={currentRecipe?.noIngredients}
      total={totalPrice}
      notices={
        <>
          {!current.ready && (
            <p className="form-warning">{t('Попросите владельца настроить эту позицию.')}</p>
          )}
          {available !== null && available !== undefined && available < amount && (
            <p className="form-warning">{t('Недостаточно ингредиентов на складе.')}</p>
          )}
        </>
      }
      disabled={
        !current.ready ||
        amount <= 0 ||
        !Number.isFinite(amount) ||
        (available !== null && available !== undefined && available < amount) ||
        (variableGlass &&
          (!Number.isInteger(servingMl) || servingMl <= 0 || servingMl > (current.bottleSizeMl || 0))) ||
        (current.kind === 'cocktail' && !Number.isInteger(amount)) ||
        (!!staffData.archivedBefore && date < staffData.archivedBefore)
      }
      submit={async () => {
        if (
          await onSubmit({
            kind: current.kind,
            productId: current.id,
            quantity: amount,
            ...(variableGlass ? { servingMl } : {}),
          })
        )
          close();
      }}
    />
  );
}

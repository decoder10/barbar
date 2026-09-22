import { expandExtraCosts, expandRecipe } from '../../domain/catalog/sets';
import { useInventoryCalculations } from '../inventory/use-inventory-calculations';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { goodsSaleUnit, ingredientVolume, round, saleUnit, volume } from '../../domain/model';
import { bottleName, isGlassServing } from '../../domain/serving';
import type { Alcohol, Cocktail, Sale } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';
import { SaleDialog, saleQuantityLabel, type SaleValue } from './SaleDialog';

export function SaleForm({
  kind,
  product,
  date,
  close,
  onSubmit,
}: {
  kind: Sale['kind'];
  product: Alcohol | Cocktail;
  date: string;
  close: () => void;
  /** Resolves truthy once the sale is recorded; the dialog then closes. */
  onSubmit: (value: SaleValue) => Promise<unknown>;
}) {
  const { data } = useBar();
  const inventory = useInventoryCalculations(data);
  const [quantity, setQuantity] = useState(kind === 'cocktail' ? '1' : '50');
  const cocktail = product as Cocktail;
  const alcohol = product as Alcohol;
  const glassServing = kind === 'cocktail' && isGlassServing(cocktail);
  const legacyBottle = glassServing
    ? data.alcohol.find(
        (a) =>
          a.category === cocktail.category &&
          a.name.trim().toLowerCase() === bottleName(cocktail.name).toLowerCase(),
      )
    : undefined;
  const glass = glassServing ? data.alcohol.find((a) => a.id === cocktail.stockAlcoholId) : undefined;
  const [glassMl, setGlassMl] = useState(String(glass?.glassSizeMl || 150));
  const servingMl = Number(glassMl);
  const scale = glass?.glassSizeMl ? servingMl / glass.glassSizeMl : 1;
  const amount = Number(quantity);
  const price = kind === 'cocktail' ? cocktail.price * scale : alcohol.pricePerLiter / 1000;
  const cost =
    kind === 'cocktail'
      ? cocktail.noIngredients
        ? cocktail.portionCost || 0
        : inventory.recipeCost(
            expandRecipe(cocktail, data.cocktails),
            expandExtraCosts(cocktail, data.cocktails),
          ) * scale
      : inventory.averageCost(product.id) / 1000;
  const recipe = glass?.bottleSizeMl
    ? [{ alcoholId: glass.id, ml: servingMl / glass.bottleSizeMl }]
    : kind === 'cocktail'
      ? expandRecipe(cocktail, data.cocktails)
      : [{ alcoholId: product.id, ml: 1 }];
  const hasRecipe =
    (!glassServing || !!glass) &&
    (recipe.length > 0 ||
      (kind === 'cocktail' && (!!cocktail.extraCosts?.length || !!cocktail.noIngredients)));
  const untracked =
    kind === 'cocktail' && !recipe.length && (!!cocktail.extraCosts?.length || !!cocktail.noIngredients);
  const available = untracked
    ? Infinity
    : kind === 'cocktail'
      ? inventory.portions(recipe)
      : inventory.stock(product.id);
  const stock = cocktail.stockAlcoholId
    ? data.alcohol.find((a) => a.id === cocktail.stockAlcoholId)
    : undefined;
  const unit =
    kind !== 'cocktail'
      ? undefined
      : glassServing
        ? 'glass'
        : cocktail.stockAlcoholId
          ? cocktail.serving || goodsSaleUnit(stock)
          : undefined;
  const name = (id: string) => data.alcohol.find((a) => a.id === id)?.name;
  return (
    <SaleDialog
      title={product.name}
      date={date}
      close={close}
      kind={kind}
      quantity={quantity}
      setQuantity={setQuantity}
      quantityLabel={saleQuantityLabel(kind, unit)}
      quantityHint={
        untracked
          ? 'Продукты учитываются по стоимости, без контроля количества'
          : `Сейчас доступно: ${kind === 'cocktail' ? `${available} ${saleUnit({ kind, unit, category: cocktail.category })}` : volume(available)}`
      }
      glass={
        glassServing
          ? {
              value: glassMl,
              onChange: setGlassMl,
              max: glass?.bottleSizeMl,
              hint: `Стоимость пропорциональна объёму. Спишется: ${Math.round((servingMl || 0) * (amount || 0))} мл.`,
              setup: !glass && (
                <div className="form-warning">
                  <p>
                    {t(
                      'Для списания укажите объём бутылки и стандартного бокала на складе. Выбранный объём будет учитываться после настройки.',
                    )}
                  </p>
                  <Link
                    className="button secondary"
                    to={
                      legacyBottle ? `/inventory?edit=${encodeURIComponent(legacyBottle.id)}` : '/inventory'
                    }
                  >
                    {t('Настроить бутылку на складе')}
                  </Link>
                </div>
              ),
            }
          : undefined
      }
      deducted={recipe.map((i) => ({
        id: i.alcoholId,
        name: name(i.alcoholId),
        amount: ingredientVolume(data, i.alcoholId, round(i.ml * (amount || 0))),
      }))}
      costLines={
        kind === 'cocktail'
          ? (cocktail.extraCosts || []).map((i) => ({
              id: i.alcoholId,
              name: name(i.alcoholId),
              amount: money(round(i.cost * (amount || 0))),
            }))
          : undefined
      }
      noIngredients={kind === 'cocktail' && cocktail.noIngredients}
      total={price * (amount || 0)}
      cost={cost * (amount || 0)}
      notices={
        <>
          {!price && (
            <p className="form-warning">
              {t('Сначала задайте цену в разделе «')}
              {t(kind === 'cocktail' ? 'Меню и рецепты' : 'Склад')}».
            </p>
          )}
          {kind === 'cocktail' && !hasRecipe && (
            <Link className="button secondary full" to={`/cocktails?edit=${product.id}`}>
              {t('Добавить состав в редакторе')}
            </Link>
          )}
          {available < amount && (
            <p className="form-warning">{t('Недостаточно ингредиентов. Добавьте закупку на складе.')}</p>
          )}
        </>
      }
      disabled={!price || !hasRecipe || available < amount || amount <= 0}
      submit={async () => {
        if (
          await onSubmit({ kind, productId: product.id, quantity: amount, ...(glass ? { servingMl } : {}) })
        )
          close();
      }}
    />
  );
}

import { useInventoryCalculations } from '../inventory/use-inventory-calculations';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, GlassVolumeField, Modal, Submit } from '../../components';
import { formatMoney as money } from '../../display-money';
import { ingredientVolume, round, saleUnit, volume } from '../../domain/model';
import { bottleName, isGlassServing } from '../../domain/serving';
import type { Alcohol, Cocktail, Sale } from '../../domain/types';
import { locale, t } from '../../i18n/runtime';
import { useBar } from '../../store';

export function SaleForm({
  kind,
  product,
  date,
  currentShift,
  close,
}: {
  kind: Sale['kind'];
  product: Alcohol | Cocktail;
  date: string;
  currentShift: boolean;
  close: () => void;
}) {
  const { data, run } = useBar();
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
      ? inventory.recipeCost(cocktail.ingredients, cocktail.extraCosts) * scale
      : inventory.averageCost(product.id) / 1000;
  const recipe = glass?.bottleSizeMl
    ? [{ alcoholId: glass.id, ml: servingMl / glass.bottleSizeMl }]
    : kind === 'cocktail'
      ? cocktail.ingredients
      : [{ alcoholId: product.id, ml: 1 }];
  const hasRecipe =
    (!glassServing || !!glass) &&
    (recipe.length > 0 || (kind === 'cocktail' && !!cocktail.extraCosts?.length));
  const untracked = kind === 'cocktail' && !recipe.length && !!cocktail.extraCosts?.length;
  const available = untracked
    ? Infinity
    : kind === 'cocktail'
      ? inventory.portions(recipe)
      : inventory.stock(product.id);
  return (
    <Modal
      title={t(product.name)}
      subtitle={`Продажа за ${new Date(`${date}T12:00:00`).toLocaleDateString(locale())}`}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              {
                type: 'sale',
                value: {
                  kind,
                  productId: product.id,
                  quantity: amount,
                  date,
                  businessDay: currentShift,
                  ...(glass ? { servingMl } : {}),
                },
              },
              'Продажа записана. Остатки обновлены.',
            )
          ) {
            close();
          }
        }}
      >
        {t(
          glassServing && (
            <GlassVolumeField
              value={glassMl}
              onChange={setGlassMl}
              max={glass?.bottleSizeMl}
              hint={`Стоимость пропорциональна объёму. Спишется: ${Math.round((servingMl || 0) * (amount || 0))} мл.`}
            />
          ),
        )}
        {glassServing && !glass && (
          <div className="form-warning">
            <p>
              {t(
                'Для списания укажите объём бутылки и стандартного бокала на складе. Выбранный объём будет учитываться после настройки.',
              )}
            </p>
            <Link
              className="button secondary"
              to={legacyBottle ? `/inventory?edit=${encodeURIComponent(legacyBottle.id)}` : '/inventory'}
            >
              {t('Настроить бутылку на складе')}
            </Link>
          </div>
        )}
        <Field
          label={
            cocktail.stockAlcoholId && cocktail.serving !== 'glass'
              ? 'Количество бутылок'
              : glassServing
                ? 'Количество бокалов'
                : kind === 'cocktail'
                  ? 'Количество порций'
                  : 'Объём продажи, мл'
          }
          hint={
            untracked
              ? 'Продукты учитываются по стоимости, без контроля количества'
              : `Сейчас доступно: ${kind === 'cocktail' ? `${available} ${saleUnit({ kind, unit: cocktail.stockAlcoholId ? cocktail.serving || 'bottle' : undefined, category: cocktail.category })}` : volume(available)}`
          }
        >
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
          {t(
            (kind === 'cocktail' ? [1, 2, 3, 5] : [30, 50, 100, 150, 500]).map((n) => (
              <button
                className={amount === n ? 'selected' : ''}
                type="button"
                key={n}
                onClick={() => setQuantity(String(n))}
              >
                {t(n)}
                {t(kind === 'alcohol' ? ' мл' : '')}
              </button>
            )),
          )}
        </div>
        <div className="recipe-breakdown">
          <div className="eyebrow">{t('СПИШЕТСЯ СО СКЛАДА')}</div>
          {t(
            recipe.map((i) => (
              <div key={i.alcoholId}>
                <span>{t(data.alcohol.find((a) => a.id === i.alcoholId)?.name)}</span>
                <b>{t(ingredientVolume(data, i.alcoholId, round(i.ml * (amount || 0))))}</b>
              </div>
            )),
          )}
        </div>
        {t(
          kind === 'cocktail' && !!cocktail.extraCosts?.length && (
            <div className="recipe-breakdown">
              <div className="eyebrow">{t('ПРОДУКТЫ ПО СТОИМОСТИ · БЕЗ СПИСАНИЯ КОЛИЧЕСТВА')}</div>
              {t(
                cocktail.extraCosts.map((i) => (
                  <div key={i.alcoholId}>
                    <span>{t(data.alcohol.find((a) => a.id === i.alcoholId)?.name)}</span>
                    <b>{t(money(round(i.cost * (amount || 0))))}</b>
                  </div>
                )),
              )}
            </div>
          ),
        )}
        <div className="form-total">
          <span>
            {t('К оплате')}
            <strong>{t(money(round(price * (amount || 0))))}</strong>
          </span>
          <small>
            {t('Себестоимость: ')}
            {t(money(round(cost * (amount || 0))))}
          </small>
        </div>
        {t(
          !price && (
            <p className="form-warning">
              {t('Сначала задайте цену в разделе «')}
              {t(kind === 'cocktail' ? 'Меню и рецепты' : 'Склад')}».
            </p>
          ),
        )}
        {t(
          kind === 'cocktail' && !hasRecipe && (
            <Link className="button secondary full" to={`/cocktails?edit=${product.id}`}>
              {t('Добавить состав в редакторе')}
            </Link>
          ),
        )}
        <Submit disabled={!price || !hasRecipe || available < amount || amount <= 0}>
          {t('Записать продажу')}
        </Submit>
        {t(
          available < amount && (
            <p className="form-warning">{t('Недостаточно ингредиентов. Добавьте закупку на складе.')}</p>
          ),
        )}
      </form>
    </Modal>
  );
}

import { ArrowUpRight, Plus } from 'lucide-react';
import { type ReactNode } from 'react';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { categoryLabel, volume } from '../../domain/model';
import type { Alcohol, Cocktail } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { menuImage } from '../../domain/catalog/legacy-images';
import { BottleArt, CocktailArt } from './art';
export function CatalogCard({
  name,
  art,
  badge,
  detail,
  footer,
  action,
  icon,
  unavailable,
}: {
  name: string;
  art: ReactNode;
  badge: string;
  detail: ReactNode;
  footer: ReactNode;
  action: () => void;
  icon?: ReactNode;
  /** Selling screens only: nothing left to pour, so the card cannot start a sale. */
  unavailable?: boolean;
}) {
  return (
    <button
      className={`drink-card${unavailable ? ' unavailable' : ''}`}
      onClick={action}
      disabled={unavailable}
      title={unavailable ? t('Нет в наличии') : undefined}
    >
      <div className="card-image">
        {art}
        <span className="card-badge">{t(badge)}</span>
        {unavailable && <span className="card-stock-out">{t('Нет в наличии')}</span>}
        <span className="card-open" aria-hidden="true">
          {icon || <ArrowUpRight size={17} />}
        </span>
      </div>
      <div className="card-content">
        <h3>{t(name)}</h3>
        {typeof detail === 'string' ? <p>{t(detail)}</p> : detail}
        <div className="card-bottom">{footer}</div>
      </div>
    </button>
  );
}

/** Composition shown on menu cards: stock ingredients, cost-only products and set tinctures. */
export const compositionText = (
  names: (string | undefined)[],
  noIngredients?: boolean,
  empty = 'Добавьте состав в редакторе',
) => names.filter(Boolean).join(' · ') || (noIngredients ? 'Без ингредиентов' : empty);

/**
 * Stock state of a menu item for owner and worker cards. `portions` is null when nothing is deducted.
 * `out`: a recipe the stock cannot pour even once, which the ledger would refuse to sell.
 */
export function stockPill({
  portions,
  lines,
  costLines,
  noIngredients,
}: {
  portions: number | null;
  lines: number;
  costLines: number;
  noIngredients?: boolean;
}) {
  if (noIngredients) return { label: 'Без ингредиентов', low: false, out: false };
  if (!lines && costLines) return { label: 'По стоимости', low: false, out: false };
  if (lines && portions) return { label: `${portions} порц.`, low: false, out: false };
  return { label: lines ? 'Нет запаса' : 'Нет состава', low: true, out: !!lines };
}

export function CocktailCard({
  cocktail,
  detail,
  footer,
  action,
  hidePrice,
  icon,
  unavailable,
}: {
  cocktail: Pick<Cocktail, 'name' | 'image' | 'category' | 'serving' | 'price'>;
  detail: ReactNode;
  footer: ReactNode;
  action: () => void;
  /** Roles without access to prices see the same card without the amount. */
  hidePrice?: boolean;
  icon?: ReactNode;
  unavailable?: boolean;
}) {
  return (
    <CatalogCard
      name={cocktail.name}
      action={action}
      detail={detail}
      icon={icon}
      unavailable={unavailable}
      art={
        <CocktailArt
          image={menuImage(cocktail)}
          name={cocktail.name}
          category={cocktail.category}
          serving={cocktail.serving}
        />
      }
      badge={categoryLabel(cocktail.category).toLocaleUpperCase()}
      footer={
        <>
          {!hidePrice && <strong>{t(cocktail.price ? money(cocktail.price) : 'Цена не задана')}</strong>}
          {t(footer)}
        </>
      }
    />
  );
}

export function AlcoholCard({
  drink,
  ml,
  action,
  selling,
}: {
  drink: Pick<Alcohol, 'name' | 'category' | 'color' | 'pricePerLiter'> &
    Partial<Pick<Alcohol, 'menuCategory'>>;
  ml: number;
  action: () => void;
  /** On a selling screen an empty bottle cannot be poured. */
  selling?: boolean;
}) {
  return (
    <CatalogCard
      name={drink.name}
      action={action}
      unavailable={selling && ml <= 0}
      art={<BottleArt drink={drink} />}
      badge={drink.category === 'mixer' ? 'МИКСЕР' : 'АЛКОГОЛЬ'}
      icon={<Plus size={17} />}
      detail={ml > 0 ? `${volume(ml)} на складе` : 'Нет на складе'}
      footer={
        <>
          <strong>{t(drink.pricePerLiter ? money(drink.pricePerLiter / 20) : 'Цена не задана')}</strong>
          <small>{t('за 50 мл')}</small>
        </>
      }
    />
  );
}

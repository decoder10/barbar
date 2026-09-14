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
}: {
  name: string;
  art: ReactNode;
  badge: string;
  detail: ReactNode;
  footer: ReactNode;
  action: () => void;
  icon?: ReactNode;
}) {
  return (
    <button className="drink-card" onClick={action}>
      <div className="card-image">
        {art}
        <span className="card-badge">{t(badge)}</span>
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

export function CocktailCard({
  cocktail,
  detail,
  footer,
  action,
}: {
  cocktail: Cocktail;
  detail: string;
  footer: ReactNode;
  action: () => void;
}) {
  return (
    <CatalogCard
      name={cocktail.name}
      action={action}
      detail={detail}
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
          <strong>{t(cocktail.price ? money(cocktail.price) : 'Укажите цену')}</strong>
          {t(footer)}
        </>
      }
    />
  );
}

export function AlcoholCard({ drink, ml, action }: { drink: Alcohol; ml: number; action: () => void }) {
  return (
    <CatalogCard
      name={drink.name}
      action={action}
      art={<BottleArt drink={drink} />}
      badge={drink.category === 'mixer' ? 'МИКСЕР' : 'АЛКОГОЛЬ'}
      icon={<Plus size={17} />}
      detail={ml > 0 ? `${volume(ml)} на складе` : 'Нет на складе'}
      footer={
        <>
          <strong>{t(drink.pricePerLiter ? money(drink.pricePerLiter / 20) : 'Укажите цену')}</strong>
          <small>{t('за 50 мл')}</small>
        </>
      }
    />
  );
}

import { ArrowUpRight, Plus } from 'lucide-react';
import { type ReactNode } from 'react';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { categoryLabel, volume } from '../../domain/model';
import type { Alcohol, Cocktail } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { menuImage } from '../../domain/catalog/legacy-images';
import { BottleArt, CocktailArt } from './art';
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
    <button className="drink-card" onClick={action}>
      <div className="card-image">
        <CocktailArt
          image={menuImage(cocktail)}
          name={cocktail.name}
          category={cocktail.category}
          serving={cocktail.serving}
        />
        <span className="card-badge">{t(categoryLabel(cocktail.category).toLocaleUpperCase())}</span>
        <span className="card-open">
          <ArrowUpRight size={17} />
        </span>
      </div>
      <div className="card-content">
        <h3>{t(cocktail.name)}</h3>
        <p>{t(detail)}</p>
        <div className="card-bottom">
          <strong>{t(cocktail.price ? money(cocktail.price) : 'Укажите цену')}</strong>
          {t(footer)}
        </div>
      </div>
    </button>
  );
}

export function AlcoholCard({ drink, ml, action }: { drink: Alcohol; ml: number; action: () => void }) {
  return (
    <button className="drink-card" onClick={action}>
      <div className="card-image">
        <BottleArt drink={drink} />
        <span className="card-badge">{t(drink.category === 'mixer' ? 'МИКСЕР' : 'АЛКОГОЛЬ')}</span>
        <span className="card-open">
          <Plus size={17} />
        </span>
      </div>
      <div className="card-content">
        <h3>{t(drink.name)}</h3>
        <p>{t(ml > 0 ? `${volume(ml)} на складе` : 'Нет на складе')}</p>
        <div className="card-bottom">
          <strong>{t(drink.pricePerLiter ? money(drink.pricePerLiter / 20) : 'Укажите цену')}</strong>
          <small>{t('за 50 мл')}</small>
        </div>
      </div>
    </button>
  );
}

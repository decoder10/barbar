import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RecipeShortage } from '../../domain/shortages';
import type { Alcohol } from '../../domain/types';
import { inventoryGroup, inventoryGroups } from '../../domain/inventory-groups';
import { t } from '../../presentation/i18n/runtime';
import { BottleArt } from '../catalog/art';

export function InventoryProduct({
  drink,
}: {
  drink: Pick<Alcohol, 'name' | 'category' | 'color' | 'bottleSizeMl'> &
    Partial<Pick<Alcohol, 'unit' | 'menuCategory' | 'group' | 'photo'>>;
}) {
  const label = inventoryGroups.find(([id]) => id === inventoryGroup(drink))?.[1] || 'Прочее';
  return (
    <div className="table-product">
      <BottleArt drink={drink} />
      <span>
        <strong>{t(drink.name)}</strong>
        <small>
          {t(label)}
          {t(drink.bottleSizeMl ? ` · ${drink.bottleSizeMl} мл/бут.` : '')}
        </small>
      </span>
    </div>
  );
}

export function InventoryStock({
  quantity,
  unavailable,
  low,
  children,
}: {
  quantity: string;
  unavailable: boolean;
  low: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <span className={`stock-pill ${low ? 'low' : ''}`}>{t(quantity)}</span>
      {unavailable && <span className="stock-unavailable-label">{t('Нет в наличии')}</span>}
      {children}
    </>
  );
}

/** Recipes that one stock item cannot cover, shown the same way to owner and worker. */
export function RecipeShortages({
  shortages,
  format,
}: {
  shortages: RecipeShortage[];
  format: (amount: number) => string;
}) {
  return (
    <details className="inventory-shortage-details">
      <summary>
        <TriangleAlert size={13} aria-hidden="true" />
        {t(' Не хватает для рецептов:')}
        {t(' ')}
        {t(shortages.length)}
      </summary>
      <ul>
        {shortages.map((recipe) => (
          <li key={recipe.id}>
            <strong>{t(recipe.name)}</strong>
            <span>
              {t('На порцию нужно ')}
              {t(format(recipe.required))}
              {t('; не хватает')}
              {t(' ')}
              {t(format(recipe.missing))}.
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Missing stock for one recipe line or card. */
export function ShortageNote({ children }: { children: ReactNode }) {
  return (
    <p className="recipe-shortage">
      <TriangleAlert size={14} aria-hidden="true" />
      {children}
    </p>
  );
}

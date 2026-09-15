import { menuCategoryConfig } from './model';
import { drinkGroups, inventoryGroup, inventoryGroups, snackGroups } from './inventory-groups';
import type { Alcohol, MenuCategory } from './types';

type IngredientOption = Pick<Alcohol, 'id' | 'name' | 'category'> & {
  unit?: Alcohol['unit'];
  group?: string;
};

/** Categories marked `foodRecipe` in `config/menu-categories.json` pick kitchen products. */
export const isFoodMenu = (category?: MenuCategory) => !!menuCategoryConfig(category)?.foodRecipe;

/** Snacks pick from food products; drinks keep bar ingredients. Stored recipes are never rewritten. */
export function ingredientGroups<T extends IngredientOption>(items: T[], category?: MenuCategory) {
  const order = isFoodMenu(category) ? snackGroups : drinkGroups;
  return order
    .map((group) => ({
      label: inventoryGroups.find(([id]) => id === group)![1],
      items: items.filter((a) => inventoryGroup(a) === group),
    }))
    .filter((group) => group.items.length);
}

export const ingredientFits = (item: IngredientOption | undefined, category?: MenuCategory) =>
  !item || (isFoodMenu(category) ? snackGroups : drinkGroups).includes(inventoryGroup(item));

/** Whole bottles/pieces start at 1. Snack weights start empty so a drink volume is never saved by accident. */
export const defaultIngredientAmount = (
  unit: Alcohol['unit'] | undefined,
  category: MenuCategory | undefined,
  drinkDefault: number,
) => (unit === 'bottle' || unit === 'pcs' ? 1 : isFoodMenu(category) ? 0 : drinkDefault);

/** Bottled goods with a known volume are entered in ml in recipes and stored as a share of one piece. */
export const mlPerPiece = (item?: { category: string; unit?: string; bottleSizeMl?: number }) =>
  item?.category === 'goods' && (item.unit === 'pcs' || item.unit === 'bottle') && item.bottleSizeMl
    ? item.bottleSizeMl
    : 0;

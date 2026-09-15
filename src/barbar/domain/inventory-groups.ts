import { barConfig, keywordMatcher, type GroupConfig } from '../config';
import type { Alcohol } from './types';

/**
 * What the product is, independent of how it is used (recipes) or sold (whole goods).
 * Groups, labels, hints and name rules live in `config/inventory-groups.json`.
 */
export type InventoryGroup = string;

const config = barConfig.groups;
const byId = new Map(config.groups.map((g) => [g.id, g]));
/** Ledger categories that are their own group; their items never take another group. */
const alcoholCategories: Alcohol['category'][] = ['alcohol', 'beer', 'wine', 'cognac'];

export const inventoryGroups: [InventoryGroup, string][] = config.groups.map((g) => [g.id, g.label]);
export const productGroupIds = config.groups.map((g) => g.id);
export const inventoryGroupHints: Record<InventoryGroup, string | undefined> = Object.fromEntries(
  config.groups.map((g) => [g.id, g.hint]),
);
export const groupConfig = (group: InventoryGroup): GroupConfig =>
  byId.get(group) || byId.get(config.fallbackGroup)!;
export const isAlcoholGroup = (group: InventoryGroup) =>
  alcoholCategories.includes(groupConfig(group).stockCategory as Alcohol['category']) &&
  groupConfig(group).id === group;

// Checked in `matchOrder`: juices before vegetables («томатный сок»), dairy before fruit («сливки»),
// preserves before vegetables («маринованные огурцы»), jerky before meat.
const rules = config.matchOrder.map((id) => [id, groupConfig(id).keywords.map(keywordMatcher)] as const);

/** Owner choice first, then the product name; alcohol types keep their own group. */
export function inventoryGroup(
  item: Pick<Alcohol, 'category' | 'name'> & { group?: string },
): InventoryGroup {
  if (alcoholCategories.includes(item.category)) return item.category;
  if (item.group && byId.has(item.group)) return item.group;
  const name = item.name.toLocaleLowerCase();
  return rules.find(([, matchers]) => matchers.some((match) => match(name)))?.[0] || config.fallbackGroup;
}

/** Drink recipes never pick kitchen groups; snack recipes never pick drinks. */
export const drinkGroups: InventoryGroup[] = config.recipePicker.drinks;
export const snackGroups: InventoryGroup[] = config.recipePicker.snacks;
/** Bar ingredients are mixers, kitchen products are food; the category keeps recipe and cost rules. */
export const categoryForGroup = (group: InventoryGroup): Alcohol['category'] =>
  groupConfig(group).stockCategory;
/** Stock unit a new item of the group starts with; whole goods use the goods unit. */
export const unitForGroup = (group: InventoryGroup, goods = false): Alcohol['unit'] =>
  goods ? groupConfig(group).goodsUnit || 'pcs' : groupConfig(group).defaultUnit;
/** Menu section of goods sold whole from this group. */
export const goodsMenuCategoryForGroup = (group: InventoryGroup) =>
  groupConfig(group).goodsMenuCategory || 'snack';

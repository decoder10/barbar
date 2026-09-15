import catalogUpgrades from './catalog-upgrades.json' with { type: 'json' };
import guestMenu from './guest-menu.json' with { type: 'json' };
import inventoryGroups from './inventory-groups.json' with { type: 'json' };
import menuCategories from './menu-categories.json' with { type: 'json' };
import presets from './presets.json' with { type: 'json' };

export type Localized = { ru: string; en: string; hy: string };
type StockCategory = 'alcohol' | 'mixer' | 'beer' | 'wine' | 'cognac' | 'food';
type StockUnit = 'ml' | 'g' | 'bottle' | 'pcs';

export interface GroupConfig {
  id: string;
  label: string;
  hint?: string;
  /** Accounting category for new items of this group (recipes and costs follow the category). */
  stockCategory: StockCategory;
  defaultUnit: StockUnit;
  goodsUnit?: StockUnit;
  goodsMenuCategory?: 'soft' | 'snack' | 'hot';
  /** Lower-case parts of product names, or `re:<pattern>` for a regular expression. */
  keywords: string[];
}
export interface InventoryGroupsConfig {
  fallbackGroup: string;
  matchOrder: string[];
  recipePicker: { drinks: string[]; snacks: string[] };
  groups: GroupConfig[];
}
export interface MenuCategoryConfig {
  id: string;
  label: string;
  /** Shown and edited in «Меню и рецепты». */
  recipes: boolean;
  /** Offers «Дополнительные расходы на порцию». */
  extraCosts: boolean;
  /** Picks kitchen products instead of bar ingredients. */
  foodRecipe: boolean;
  /** Legacy photo sheets; categories without them pick from `categoryPhotos`. */
  photoSheets?: number[];
  guestTitle: Localized;
}
export interface MenuCategoriesConfig {
  sets: { category: string; componentCategory: string; maxShots: number; maxComponents: number };
  categories: MenuCategoryConfig[];
}
export interface CatalogUpgradesConfig {
  goodsColor: string;
  /** Default paper-menu items resold whole, with the stock unit they start with. */
  goods: Record<'soft' | 'snack' | 'hot', { unit: 'bottle' | 'pcs'; names: string[] }>;
  /** Bar or kitchen stock names (lower case) that describe the same product as a goods item. */
  duplicates: Record<string, string[]>;
  /** Owner decisions: a bar item in ml becomes the goods item behind a menu drink. */
  merges: { stock: string; menu: string; saleAmount: number; group: string }[];
}
export interface PresetsConfig {
  bottleSizesMl: number[];
  glassSizesMl: number[];
  purchaseQuickAmounts: { pcs: number[]; bottle: number[]; volume: number[] };
  batchExpirySoonDays: number;
  cardPageSize: number;
  storage: { limitMb: number; warningPercent: number };
}
export interface GuestMenuConfig {
  languages: ('en' | 'ru' | 'hy')[];
  sectionOrder: string[];
  /** Spirits sold by the portion straight from stock; `{ml}` in the title is replaced by the portion. */
  pouredAlcohol: { portionMl: number; title: Localized };
  copy: Record<
    | 'tagline'
    | 'search'
    | 'nothing'
    | 'loading'
    | 'error'
    | 'retry'
    | 'glass'
    | 'bottle'
    | 'sections'
    | 'prices'
    | 'photos'
    | 'service',
    Localized
  >;
}

/** Bar configuration: labels, grouping rules, catalog upgrades and presets live in JSON, not in code. */
export const barConfig = {
  groups: inventoryGroups as InventoryGroupsConfig,
  menu: menuCategories as MenuCategoriesConfig,
  upgrades: catalogUpgrades as CatalogUpgradesConfig,
  presets: presets as PresetsConfig,
  guest: guestMenu as GuestMenuConfig,
};
export type BarConfig = typeof barConfig;

/** Compile a keyword: a plain lower-case part of the name, or a `re:` regular expression. */
export function keywordMatcher(keyword: string) {
  if (keyword.startsWith('re:')) {
    const pattern = new RegExp(keyword.slice(3), 'u');
    return (name: string) => pattern.test(name);
  }
  const text = keyword.toLocaleLowerCase();
  return (name: string) => name.includes(text);
}

/** Stable short hash of a config section; migration keys change when their config changes. */
export function configHash(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const languagesOf = (value: Localized | undefined) => (value ? [value.ru, value.en, value.hy] : []);
const localizedValid = (value: Localized | undefined) =>
  languagesOf(value).length === 3 && languagesOf(value).every((v) => typeof v === 'string' && v.trim());

/** Every problem in the configuration; empty when valid. Checked by unit tests before deployment. */
export function validateConfig(config: BarConfig = barConfig, ledgerMenuCategories: string[] = []): string[] {
  const problems: string[] = [];
  const groupIds = config.groups.groups.map((g) => g.id);
  const unique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) problems.push(`${label}: duplicate ids`);
  };
  unique('groups', groupIds);
  for (const group of config.groups.groups) {
    if (!group.label.trim()) problems.push(`group ${group.id}: empty label`);
    for (const keyword of group.keywords) {
      try {
        keywordMatcher(keyword)('test');
      } catch {
        problems.push(`group ${group.id}: invalid keyword ${keyword}`);
      }
    }
    if (group.goodsMenuCategory && !['soft', 'snack', 'hot'].includes(group.goodsMenuCategory))
      problems.push(`group ${group.id}: goodsMenuCategory must be soft, snack or hot`);
  }
  for (const id of ['alcohol', 'beer', 'wine', 'cognac'])
    if (config.groups.groups.find((g) => g.id === id)?.stockCategory !== id)
      problems.push(`groups: required group ${id} with stockCategory ${id}`);
  if (!groupIds.includes(config.groups.fallbackGroup)) problems.push('groups: unknown fallbackGroup');
  for (const [label, ids] of [
    ['matchOrder', config.groups.matchOrder],
    ['recipePicker.drinks', config.groups.recipePicker.drinks],
    ['recipePicker.snacks', config.groups.recipePicker.snacks],
  ] as const)
    for (const id of ids) if (!groupIds.includes(id)) problems.push(`${label}: unknown group ${id}`);

  const categoryIds = config.menu.categories.map((c) => c.id);
  unique('menu categories', categoryIds);
  for (const id of ledgerMenuCategories)
    if (!categoryIds.includes(id)) problems.push(`menu categories: missing ${id}`);
  for (const id of categoryIds)
    if (ledgerMenuCategories.length && !ledgerMenuCategories.includes(id))
      problems.push(`menu categories: ${id} is not supported by the ledger`);
  if (config.menu.categories.some((c) => c.foodRecipe && !c.recipes))
    problems.push('menu: a foodRecipe category must be shown in recipes');
  for (const category of config.menu.categories) {
    if (!localizedValid(category.guestTitle))
      problems.push(`menu ${category.id}: guestTitle needs ru, en and hy`);
    if (category.photoSheets?.some((s) => !Number.isInteger(s) || s < 0 || s > 3))
      problems.push(`menu ${category.id}: photoSheets must be sheet numbers 0–3`);
  }
  const sets = config.menu.sets;
  for (const id of [sets.category, sets.componentCategory])
    if (!categoryIds.includes(id)) problems.push(`sets: unknown category ${id}`);
  if (!(sets.maxShots >= 1 && sets.maxComponents >= 1))
    problems.push('sets: maxShots and maxComponents must be positive');

  for (const id of config.guest.sectionOrder)
    if (id !== 'alcohol' && !categoryIds.includes(id)) problems.push(`guest sectionOrder: unknown ${id}`);
  for (const [key, value] of Object.entries(config.guest.copy))
    if (!localizedValid(value)) problems.push(`guest copy ${key}: needs ru, en and hy`);
  const poured = config.guest.pouredAlcohol;
  if (!localizedValid(poured.title) || languagesOf(poured.title).some((v) => !v.includes('{ml}')))
    problems.push('guest pouredAlcohol.title: needs ru, en and hy with {ml}');
  if (!(poured.portionMl > 0)) problems.push('guest pouredAlcohol.portionMl must be positive');

  const lower = (text: string) => text === text.toLocaleLowerCase();
  for (const merge of config.upgrades.merges) {
    if (!(merge.saleAmount > 0) || !lower(merge.stock) || !lower(merge.menu))
      problems.push(`merge ${merge.menu}: lower-case names and a positive saleAmount are required`);
    if (!config.groups.groups.find((g) => g.id === merge.group)?.goodsMenuCategory)
      problems.push(`merge ${merge.menu}: group ${merge.group} must exist and have goodsMenuCategory`);
  }
  for (const [section, goods] of Object.entries(config.upgrades.goods))
    if (!['bottle', 'pcs'].includes(goods.unit) || goods.names.some((n) => !n.trim()))
      problems.push(`goods ${section}: unit bottle or pcs and non-empty names are required`);
  for (const [stock, menus] of Object.entries(config.upgrades.duplicates))
    if (!lower(stock) || !menus.every(lower)) problems.push(`duplicates ${stock}: names must be lower case`);
  if (!/^#[0-9a-f]{6}$/i.test(config.upgrades.goodsColor)) problems.push('goodsColor must be #rrggbb');

  const positive = (label: string, values: number[]) => {
    if (!values.length || values.some((n) => !(n > 0))) problems.push(`${label}: positive numbers required`);
  };
  const p = config.presets;
  positive('bottleSizesMl', p.bottleSizesMl);
  positive('glassSizesMl', p.glassSizesMl);
  for (const [unit, values] of Object.entries(p.purchaseQuickAmounts))
    positive(`purchaseQuickAmounts.${unit}`, values);
  if (!(Number.isInteger(p.cardPageSize) && p.cardPageSize >= 1 && p.cardPageSize <= 200))
    problems.push('cardPageSize must be 1–200');
  if (!(Number.isInteger(p.batchExpirySoonDays) && p.batchExpirySoonDays >= 0))
    problems.push('batchExpirySoonDays must be a whole number of days');
  if (!(p.storage.limitMb > 0 && p.storage.warningPercent > 0 && p.storage.warningPercent <= 100))
    problems.push('storage: limitMb > 0 and warningPercent 1–100 are required');
  return problems;
}

import { barConfig } from '../../config';
import { goodsMenuCategoryForGroup } from '../inventory-groups';
import type { BarData, GoodsCategory } from '../types';

const upgrades = barConfig.upgrades;
/** Paper-menu items resold by the piece: bottles, packs, tea bags and ready portions (`config/catalog-upgrades.json`). */
export const defaultGoods = Object.fromEntries(
  Object.entries(upgrades.goods).map(([section, goods]) => [section, goods.names]),
) as Record<GoodsCategory, string[]>;
export const goodsColor = upgrades.goodsColor;
/** Bar or kitchen stock names that describe the same product as converted goods (lower case). */
export const duplicateStock = upgrades.duplicates;

/**
 * Link untouched default menu items to piece stock. Items with a recipe, product costs, a stock link or
 * sales are left alone; existing names win. Returns null when nothing changes.
 */
/** `used`: stock IDs with purchases, movements, resets, sold ingredients, archive or a non-zero balance. */
export function migrateGoodsCatalog(
  data: Pick<BarData, 'alcohol' | 'cocktails'>,
  sold: Set<string>,
  used: Set<string> = new Set(),
) {
  const next = structuredClone(data);
  const names = new Set(next.alcohol.map((a) => a.name.trim().toLocaleLowerCase()));
  let changed = false;
  for (const menu of next.cocktails) {
    const section = menu.category as GoodsCategory;
    const listed = defaultGoods[section]?.some(
      (n) => n.toLocaleLowerCase() === menu.name.trim().toLocaleLowerCase(),
    );
    const id = `goods-${menu.id}`;
    if (
      !listed ||
      menu.stockAlcoholId ||
      menu.ingredients.length ||
      menu.extraCosts?.length ||
      menu.noIngredients ||
      sold.has(menu.id) ||
      id.length > 80 ||
      next.alcohol.some((a) => a.id === id) ||
      names.has(menu.name.trim().toLocaleLowerCase())
    )
      continue;
    next.alcohol.push({
      id,
      name: menu.name.trim(),
      category: 'goods',
      menuCategory: section,
      // Configured per section (bottles for soft drinks, pieces for packs and tea bags). Units can change until used.
      unit: upgrades.goods[section].unit,
      costPerLiter: 0,
      pricePerLiter: menu.price,
      color: goodsColor,
    });
    names.add(menu.name.trim().toLocaleLowerCase());
    Object.assign(menu, {
      stockAlcoholId: id,
      ingredients: [{ alcoholId: id, ml: 1 }],
      notes: menu.notes || 'Одна продажа списывает 1 шт. со склада.',
    });
    changed = true;
  }
  // One product, one stock item: remove unused bar/kitchen duplicates of converted goods.
  const goodsNames = new Set(
    next.cocktails
      .filter((c) => next.alcohol.some((a) => a.id === c.stockAlcoholId && a.category === 'goods'))
      .map((c) => c.name.trim().toLocaleLowerCase()),
  );
  const referenced = new Set(
    next.cocktails.flatMap((c) => [
      ...c.ingredients.map((i) => i.alcoholId),
      ...(c.extraCosts || []).map((i) => i.alcoholId),
      ...(c.stockAlcoholId ? [c.stockAlcoholId] : []),
    ]),
  );
  const removed: string[] = [];
  const kept: string[] = [];
  next.alcohol = next.alcohol.filter((a) => {
    const replacements = duplicateStock[a.name.trim().toLocaleLowerCase()];
    if (
      !replacements ||
      !['mixer', 'food'].includes(a.category) ||
      !replacements.some((n) => goodsNames.has(n))
    )
      return true;
    if (used.has(a.id) || referenced.has(a.id)) {
      kept.push(a.name);
      return true;
    }
    removed.push(a.id);
    changed = true;
    return false;
  });
  return changed ? { ...next, removed, kept } : null;
}

/** Owner decisions (15.09.2026): the bar stock item in ml becomes the one item behind the menu drink. */
export const goodsMerges = upgrades.merges;

/**
 * Merge a bar stock item (kept with its purchases and recipes) with the separate goods item of the same drink.
 * The goods item is removed only when it has no history; otherwise the pair is reported and left as is.
 */
export function mergeGoodsDuplicates(data: Pick<BarData, 'alcohol' | 'cocktails'>, used: Set<string>) {
  const next = structuredClone(data);
  const merged: string[] = [];
  const kept: string[] = [];
  const sized: string[] = [];
  for (const rule of goodsMerges) {
    const stock = next.alcohol.find(
      (a) => a.category === 'mixer' && a.unit === 'ml' && a.name.trim().toLocaleLowerCase() === rule.stock,
    );
    const menu = next.cocktails.find(
      (c) =>
        c.category === goodsMenuCategoryForGroup(rule.group) &&
        c.name.trim().toLocaleLowerCase() === rule.menu,
    );
    if (!menu) continue;
    const goods = menu.stockAlcoholId ? next.alcohol.find((a) => a.id === menu.stockAlcoholId) : undefined;
    // Only the generated whole-item link may be replaced. Owner recipes and explicit
    // sales without ingredients take precedence over the bootstrap defaults.
    if (
      menu.noIngredients ||
      menu.extraCosts?.length ||
      menu.components?.length ||
      (menu.stockAlcoholId && !goods) ||
      (goods
        ? menu.ingredients.length !== 1 ||
          menu.ingredients[0].alcoholId !== goods.id ||
          menu.ingredients[0].ml !== (goods.saleAmount || 1)
        : menu.ingredients.length > 0)
    ) {
      kept.push(menu.name);
      continue;
    }
    // Already merged (e.g. by an earlier version): stock and menu show the same name.
    if (goods && goods.category === 'goods' && goods.name.trim().toLocaleLowerCase() === rule.stock) {
      if (goods.name !== menu.name && !next.alcohol.some((a) => a.id !== goods.id && a.name === menu.name)) {
        goods.name = menu.name;
        merged.push(menu.name);
      }
      continue;
    }
    if (!stock) {
      // No bar duplicate: the whole bottle keeps its volume for cocktails in ml.
      if (
        goods?.category === 'goods' &&
        (goods.unit === 'bottle' || goods.unit === 'pcs') &&
        !goods.bottleSizeMl
      ) {
        goods.bottleSizeMl = rule.saleAmount;
        sized.push(goods.id);
      }
      continue;
    }
    if (goods && (goods.category !== 'goods' || used.has(goods.id))) {
      kept.push(`${stock.name} / ${menu.name}`);
      continue;
    }
    const otherUse = next.cocktails.some(
      (c) =>
        c.id !== menu.id &&
        ((c.stockAlcoholId === goods?.id && !!goods) ||
          c.ingredients.some((i) => i.alcoholId === goods?.id) ||
          c.extraCosts?.some((i) => i.alcoholId === goods?.id)),
    );
    if (goods && otherUse) {
      kept.push(`${stock.name} / ${menu.name}`);
      continue;
    }
    Object.assign(stock, {
      name: menu.name,
      category: 'goods',
      menuCategory: goodsMenuCategoryForGroup(rule.group),
      group: rule.group,
      saleAmount: rule.saleAmount,
      pricePerLiter: menu.price,
    });
    Object.assign(menu, {
      stockAlcoholId: stock.id,
      ingredients: [{ alcoholId: stock.id, ml: rule.saleAmount }],
      notes: `Одна продажа списывает ${rule.saleAmount} мл со склада.`,
    });
    if (goods) next.alcohol = next.alcohol.filter((a) => a.id !== goods.id);
    merged.push(stock.name);
  }
  // Null when nothing changes, so a rerun does not bump the catalog revision.
  return merged.length || sized.length
    ? {
        ...next,
        merged,
        kept,
        removed: data.alcohol.filter((a) => !next.alcohol.some((b) => b.id === a.id)).map((a) => a.id),
      }
    : null;
}

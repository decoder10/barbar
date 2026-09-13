import type { BarData } from './types';

// Only unconfigured, unsold catalogue entries are eligible. Never reinterpret a
// millilitre ledger as bottle counts or invent a brand for historical stock.
export function migrateBottleCatalog(data: BarData): BarData {
  const next = structuredClone(data);
  let changed = false;
  for (const menu of next.cocktails) {
    if (!(menu.category === 'beer' || (menu.category === 'wine' && /·\s*бутылка$/i.test(menu.name))))
      continue;
    if (
      menu.stockAlcoholId ||
      menu.ingredients.length ||
      menu.extraCosts?.length ||
      data.sales.some((s) => s.kind === 'cocktail' && s.productId === menu.id) ||
      data.archived?.count
    )
      continue;
    const id = `stock-${menu.id}`;
    const name = menu.name.replace(/\s*·\s*бутылка$/i, '').trim();
    if (
      id.length > 80 ||
      next.alcohol.some((a) => a.id === id || a.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    )
      continue;
    next.alcohol.push({
      id,
      name,
      category: menu.category,
      unit: 'bottle',
      costPerLiter: 0,
      pricePerLiter: menu.price,
      ...(menu.category === 'wine'
        ? {
            glassPrice:
              data.cocktails.find((c) => c.category === 'wine' && c.name === `${name} · бокал`)?.price || 0,
          }
        : {}),
      color: menu.category === 'wine' ? '#923c51' : '#b58636',
    });
    menu.stockAlcoholId = id;
    menu.ingredients = [{ alcoholId: id, ml: 1 }];
    menu.notes = 'Одна продажа списывает одну бутылку этой марки.';
    changed = true;
  }
  // Remove only untouched generic placeholders. Any historical use retains the
  // original item, its units and prices for recipes, reversals and backups.
  next.alcohol = next.alcohol.filter((a) => {
    if (
      !['beer', 'wine'].includes(a.id) ||
      !['Пиво', 'Вино'].includes(a.name) ||
      a.costPerLiter ||
      a.pricePerLiter
    )
      return true;
    const used =
      data.purchases.some((p) => p.alcoholId === a.id) ||
      data.cocktails.some(
        (c) =>
          c.ingredients.some((i) => i.alcoholId === a.id) || c.extraCosts?.some((i) => i.alcoholId === a.id),
      ) ||
      data.sales.some((s) => s.productId === a.id || s.ingredients.some((i) => i.alcoholId === a.id)) ||
      data.stockResets?.some((r) => r.alcoholId === a.id) ||
      data.archived?.ingredients.some((i) => i.alcoholId === a.id);
    if (!used) changed = true;
    return !!used;
  });
  for (const legacy of next.alcohol.filter(
    (a) => ['cognac', 'ararat-coffee', 'ararat-honey', 'ararat-cherry'].includes(a.id) && a.unit !== 'bottle',
  )) {
    const used =
      data.purchases.some((p) => p.alcoholId === legacy.id) ||
      data.cocktails.some((c) => c.ingredients.some((i) => i.alcoholId === legacy.id)) ||
      data.sales.some(
        (s) => s.productId === legacy.id || s.ingredients.some((i) => i.alcoholId === legacy.id),
      ) ||
      data.stockResets?.some((r) => r.alcoholId === legacy.id) ||
      data.archived?.ingredients.some((i) => i.alcoholId === legacy.id);
    const id = used ? `bottled-${legacy.id}` : legacy.id;
    if (used && next.alcohol.some((a) => a.id === id)) continue;
    const item = {
      ...legacy,
      id,
      name: used ? `${legacy.name} (бутылки)` : legacy.name,
      category: 'cognac' as const,
      unit: 'bottle' as const,
      costPerLiter: 0,
      pricePerLiter: 0,
    };
    if (used) next.alcohol.push(item);
    else Object.assign(legacy, item);
    if (!next.cocktails.some((c) => c.id === `bottle-${id}`))
      next.cocktails.push({
        id: `bottle-${id}`,
        name: `${item.name} · бутылка`,
        category: 'cognac',
        stockAlcoholId: id,
        ingredients: [{ alcoholId: id, ml: 1 }],
        price: 0,
        image: 60,
      });
    changed = true;
  }
  for (const [id, name, color] of [
    ['bacardi-white', 'Bacardi белый', '#d6c59b'],
    ['bacardi-dark', 'Bacardi тёмный', '#79502c'],
  ]) {
    if (!next.alcohol.some((a) => a.id === id || a.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      next.alcohol.push({
        id,
        name,
        color,
        category: 'alcohol',
        unit: 'ml',
        costPerLiter: 0,
        pricePerLiter: 0,
      });
      changed = true;
    }
  }
  for (const [slug, name] of [
    ['cherry', '379 — Вишня'],
    ['pilsner', '379 — Pilsner'],
    ['dankel', '379 — Dankel'],
    ['citrus', '379 — Citrus'],
    ['weizen', '379 — ոեիսեն'],
  ]) {
    const id = `beer-379-${slug}`;
    const menuId = `bottle-${id}`;
    const existing = next.alcohol.find(
      (a) => a.id === id || a.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (existing && (existing.category !== 'beer' || existing.unit !== 'bottle')) continue;
    if (
      next.cocktails.some(
        (c) =>
          c.id === menuId ||
          c.stockAlcoholId === (existing?.id || id) ||
          (c.category === 'beer' && c.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()),
      )
    )
      continue;
    const beer = existing || {
      id,
      name,
      category: 'beer' as const,
      unit: 'bottle' as const,
      costPerLiter: 0,
      pricePerLiter: 0,
      color: '#b58636',
    };
    if (!existing) next.alcohol.push(beer);
    next.cocktails.push({
      id: menuId,
      name: beer.name,
      category: 'beer',
      stockAlcoholId: beer.id,
      ingredients: [{ alcoholId: beer.id, ml: 1 }],
      price: beer.pricePerLiter,
      image: 7,
      notes: 'Одна продажа списывает одну бутылку этой марки.',
    });
    changed = true;
  }
  return changed ? next : data;
}

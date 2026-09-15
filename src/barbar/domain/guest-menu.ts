import { barConfig } from '../config';
import { round } from './model';
import { bottleName, isGlassServing } from './serving';
import type { BarData, MenuCategory } from './types';

export type GuestSectionId = MenuCategory | 'alcohol';
/** Paper menu order from `config/guest-menu.json`. */
export const guestSectionOrder = barConfig.guest.sectionOrder as GuestSectionId[];
export interface GuestPrice {
  kind: 'portion' | 'glass' | 'bottle';
  /** Selling price in AMD, the same value used when a sale is recorded. */
  price: number;
  portion?: string;
}
export interface GuestMenuItem {
  id: string;
  name: string;
  /** Winery or producer for grouped wines. */
  group?: string;
  /** Stored name, used only to choose the illustrative photo. */
  photoName: string;
  image: number;
  category: GuestSectionId;
  serving?: 'glass' | 'bottle';
  prices: GuestPrice[];
}
export interface GuestMenu {
  revision: string;
  currency: 'AMD';
  sections: { id: GuestSectionId; items: GuestMenuItem[] }[];
}

const portionText = (value?: string) => value?.trim() || undefined;

/** Public allowlist: names, selling prices, portions and photos only. No costs, stock, recipes or IDs of stock. */
export function guestMenu(data: Pick<BarData, 'alcohol' | 'cocktails'>, revision: string): GuestMenu {
  const alcohol = new Map(data.alcohol.map((a) => [a.id, a]));
  const sections = new Map<GuestSectionId, GuestMenuItem[]>();
  const variants = new Map<string, GuestMenuItem>();
  const add = (item: GuestMenuItem) =>
    sections.set(item.category, [...(sections.get(item.category) || []), item]);
  for (const c of data.cocktails) {
    if (c.guestHidden || !(c.price > 0)) continue;
    const category = c.category || 'cocktail';
    const stock = c.stockAlcoholId ? alcohol.get(c.stockAlcoholId) : undefined;
    const glass = isGlassServing(c);
    // Piece goods (cola, chips, tea bags) are portions, not bottles of wine or beer.
    const bottle =
      !glass && ((!!stock && stock.category !== 'goods') || /·\s*(бутылка|bottle)\s*$/i.test(c.name));
    const base = glass || bottle ? bottleName(c.name) : c.name.trim();
    const split = category === 'wine' ? base.indexOf(' · ') : -1;
    const portion =
      portionText(c.portion) ||
      (glass && stock?.glassSizeMl
        ? `${stock.glassSizeMl} мл`
        : bottle && stock?.bottleSizeMl
          ? `${stock.bottleSizeMl} мл`
          : undefined);
    const price: GuestPrice = {
      kind: glass ? 'glass' : bottle ? 'bottle' : 'portion',
      price: c.price,
      ...(portion ? { portion } : {}),
    };
    // Legacy glasses are not linked to stock while their bottle may be: match by the shared base name.
    const key = glass || bottle ? `${category}:${base.toLocaleLowerCase()}` : '';
    const existing = key ? variants.get(key) : undefined;
    if (existing) {
      existing.prices.push(price);
      if (glass) Object.assign(existing, { image: c.image, photoName: c.name, serving: 'glass' });
      continue;
    }
    const item: GuestMenuItem = {
      id: c.id,
      name: split > 0 ? base.slice(split + 3) : base,
      ...(split > 0 ? { group: base.slice(0, split) } : {}),
      photoName: c.name,
      image: c.image,
      category,
      ...(glass ? { serving: 'glass' as const } : bottle ? { serving: 'bottle' as const } : {}),
      prices: [price],
    };
    if (key) variants.set(key, item);
    add(item);
  }
  const { portionMl } = barConfig.guest.pouredAlcohol;
  for (const a of data.alcohol)
    if (a.category === 'alcohol' && a.pricePerLiter > 0 && !a.guestHidden)
      add({
        id: a.id,
        name: a.name,
        photoName: a.name,
        image: 0,
        category: 'alcohol',
        prices: [
          { kind: 'portion', price: round((a.pricePerLiter * portionMl) / 1000), portion: `${portionMl} мл` },
        ],
      });
  const rank = { glass: 0, portion: 1, bottle: 2 };
  for (const items of sections.values())
    for (const item of items) item.prices.sort((a, b) => rank[a.kind] - rank[b.kind]);
  return {
    revision,
    currency: 'AMD',
    sections: guestSectionOrder
      .map((id) => ({ id, items: sections.get(id) || [] }))
      .filter((section) => section.items.length),
  };
}

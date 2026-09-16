import { describe, expect, it } from 'vitest';
import { initialData, stockTotals } from '../../model';
import { cardPage, parseCardQueries, parseCardQuery } from '../cards';
import { recipeMissing } from '../recipe-status';

const data = initialData();
data.cocktails = data.cocktails.map((c, i) =>
  i < 3 ? { ...c, ingredients: [{ alcoholId: 'gin', ml: 50 }] } : c,
);
const stock = new Map([['gin', 120]]);
const query = {
  resource: 'cocktails' as const,
  category: 'all',
  search: '',
  sort: 'original' as const,
  offset: 0,
  limit: 24,
};

describe('server catalog card pages', () => {
  it('pages the whole filtered catalog in menu order without truncating the reference', () => {
    const first = cardPage(data, stock, query);
    const all = data.cocktails.length;
    expect(first.ids).toEqual(data.cocktails.slice(0, 24).map((c) => c.id));
    expect(first).toMatchObject({ total: all, nextOffset: 24 });
    const last = cardPage(data, stock, { ...query, offset: 24 * Math.floor(all / 24) });
    expect(last.nextOffset).toBeNull();
    expect(first.available[data.cocktails[0].id]).toBe(2);
  });

  it('searches and sorts across every page, not only the loaded one', () => {
    const found = cardPage(data, stock, { ...query, search: 'SANDWICH', limit: 2 });
    expect(found.total).toBe(3);
    const byPriceDesc = cardPage(data, stock, { ...query, sort: 'price-desc', limit: 1 });
    const maximum = Math.max(...data.cocktails.map((c) => c.price));
    expect(data.cocktails.find((c) => c.id === byPriceDesc.ids[0])!.price).toBe(maximum);
    const popular = cardPage(
      data,
      stock,
      { ...query, sort: 'popular', limit: 1 },
      new Map([[`cocktail:${data.cocktails[150].id}`, 4]]),
    );
    expect(popular.ids).toEqual([data.cocktails[150].id]);
    // Without sales the order is the menu order, not the alphabet: equally popular items keep their place.
    expect(cardPage(data, stock, { ...query, sort: 'popular' }).ids).toEqual(
      data.cocktails.slice(0, 24).map((c) => c.id),
    );
  });

  it('answers both resources from one request and rejects duplicates or extras', () => {
    const both = parseCardQueries(
      new URLSearchParams('resources=cocktails,alcohol&sort=popular&date=2026-09-16'),
    );
    expect(both.map((q) => q.resource)).toEqual(['cocktails', 'alcohol']);
    expect(both.every((q) => q.sort === 'popular' && q.date === '2026-09-16')).toBe(true);
    expect(parseCardQueries(new URLSearchParams('resource=alcohol'))).toHaveLength(1);
    expect(() => parseCardQueries(new URLSearchParams('resources=alcohol,alcohol'))).toThrow();
    expect(() => parseCardQueries(new URLSearchParams('resources=cocktails,alcohol,users'))).toThrow();
  });

  it('calls a recipe missing only when nothing explains what is poured', () => {
    expect(recipeMissing({ ingredients: [] })).toBe(true);
    expect(recipeMissing({ ingredients: [{ alcoholId: 'gin', ml: 50 }] })).toBe(false);
    expect(recipeMissing({ ingredients: [], noIngredients: true })).toBe(false);
    expect(recipeMissing({ ingredients: [], components: [{ cocktailId: 'x', quantity: 2 }] })).toBe(false);
    // One rule for both roles: owner `extraCosts` and worker `managedIngredientIds` both count.
    expect(recipeMissing({ ingredients: [], managed: 1 })).toBe(false);
  });

  it('keeps poured alcohol as a separate resource and validates queries', () => {
    const alcohol = cardPage(data, stockTotals(data), { ...query, resource: 'alcohol', category: 'alcohol' });
    expect(alcohol.ids.every((id) => data.alcohol.find((a) => a.id === id)?.category === 'alcohol')).toBe(
      true,
    );
    expect(cardPage(data, stock, { ...query, category: 'alcohol' }).total).toBe(0);
    expect(() => parseCardQuery(new URLSearchParams('resource=users'))).toThrow();
    expect(() => parseCardQuery(new URLSearchParams('resource=cocktails&limit=5000'))).toThrow();
    expect(
      parseCardQuery(new URLSearchParams('resource=alcohol&sort=popular&date=2026-09-15')),
    ).toMatchObject({
      resource: 'alcohol',
      sort: 'popular',
      date: '2026-09-15',
    });
  });
});

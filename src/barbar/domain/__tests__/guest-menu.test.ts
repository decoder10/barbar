import { describe, expect, it } from 'vitest';
import { migrateBottleCatalog } from '../catalog/bottles';
import { guestMenu } from '../guest-menu';
import { quoteGuestRequest } from '../guest-requests';
import { applyCommand, initialData } from '../model';

describe('guest menu', () => {
  const data = migrateBottleCatalog(initialData());
  data.cocktails = data.cocktails.map((c) =>
    c.name === 'Negroni'
      ? { ...c, ingredients: [{ alcoholId: 'gin', ml: 30 }], extraCosts: [], notes: 'secret recipe' }
      : c,
  );
  data.alcohol = data.alcohol.map((a) => (a.id === 'gin' ? { ...a, costPerLiter: 9200 } : a));
  const menu = guestMenu(data, 'rev-1');
  const items = menu.sections.flatMap((s) => s.items);

  it('exposes only guest fields and live selling prices', () => {
    const text = JSON.stringify(menu);
    expect(text).not.toMatch(/cost|ingredient|notes|stockAlcoholId|secret|9200|available/i);
    expect(items.find((i) => i.name === 'Negroni')?.prices).toEqual([
      { kind: 'portion', price: 2900, productId: 'menu-005', productKind: 'cocktail' },
    ]);
    expect(menu.sections.map((s) => s.id).slice(0, 4)).toEqual(['cocktail', 'tincture', 'set', 'shot']);
  });

  it('merges glass and bottle prices of one wine under its producer', () => {
    const wine = items.find((i) => i.category === 'wine' && i.name === 'Volcani red dry Haghtanak')!;
    expect(wine.group).toBe('Voskeni');
    expect(wine.prices.map((p) => [p.kind, p.price])).toEqual([
      ['glass', 1500],
      ['bottle', 6500],
    ]);
    expect(items.filter((i) => i.name === 'Volcani red dry Haghtanak')).toHaveLength(1);
  });

  it('lists poured alcohol by 50 ml and hides unpriced or hidden items', () => {
    const priced = applyCommand(data, {
      id: 'vodka-price',
      type: 'alcohol',
      value: { ...data.alcohol.find((a) => a.id === 'vodka')!, pricePerLiter: 18000 },
    });
    expect(guestMenu(priced, 'r').sections.find((s) => s.id === 'alcohol')?.items).toContainEqual(
      expect.objectContaining({
        name: 'Vodka',
        prices: [
          {
            kind: 'portion',
            price: 900,
            portion: '50 мл',
            productId: 'vodka',
            productKind: 'alcohol',
            servingMl: 50,
          },
        ],
      }),
    );
    expect(items.some((i) => i.name === 'Your cocktail')).toBe(false);
    const hidden = {
      ...data,
      cocktails: data.cocktails.map((c) => ({ ...c, guestHidden: c.name === 'Negroni' })),
    };
    expect(
      guestMenu(hidden, 'r')
        .sections.flatMap((s) => s.items)
        .some((i) => i.name === 'Negroni'),
    ).toBe(false);
  });

  it('marks availability from stock balances without leaking quantities', () => {
    const priced = applyCommand(data, {
      id: 'vodka-price',
      type: 'alcohol',
      value: { ...data.alcohol.find((a) => a.id === 'vodka')!, pricePerLiter: 18000 },
    });
    const prices = (balances: [string, number][]) =>
      new Map(
        guestMenu(priced, 'r', new Map(balances))
          .sections.flatMap((s) => s.items)
          .flatMap((i) => i.prices)
          .map((p) => [p.productId, p.available]),
      );
    // Negroni pours 30 ml of gin; a poured drink needs one 50 ml portion.
    const short = prices([
      ['gin', 29],
      ['vodka', 49],
    ]);
    expect(short.get('menu-005')).toBe(false);
    expect(short.get('vodka')).toBe(false);
    // A recipe that deducts nothing is always available, as the ledger accepts its sale.
    expect(short.get('menu-001')).toBe(true);
    const enough = prices([
      ['gin', 30],
      ['vodka', 50],
    ]);
    expect(enough.get('menu-005')).toBe(true);
    expect(enough.get('vodka')).toBe(true);
    const text = JSON.stringify(guestMenu(priced, 'r', new Map([['gin', 12345]])));
    expect(text).not.toMatch(/12345|"ml"|"stock"/);
    // The server refuses a line the menu shows as out of stock, and names it.
    const input = {
      id: 'a'.repeat(32),
      code: 'abcdef',
      comment: '',
      lines: [{ id: 'one', kind: 'cocktail' as const, productId: 'menu-005', quantity: 1 }],
    };
    expect(() => quoteGuestRequest(priced, input, new Map([['gin', 29]]))).toThrow(
      'Позиция закончилась: Negroni',
    );
    expect(quoteGuestRequest(priced, input, new Map([['gin', 30]]))).toHaveLength(1);
    expect(quoteGuestRequest(priced, input)).toHaveLength(1);
  });

  it('reflects a changed selling price and an owner portion', () => {
    const negroni = data.cocktails.find((c) => c.name === 'Negroni')!;
    const next = applyCommand(data, {
      id: 'price',
      type: 'cocktail',
      value: { ...negroni, price: 3100, portion: '90 мл' },
    });
    expect(guestMenu(next, 'r2').sections[0].items.find((i) => i.name === 'Negroni')?.prices).toEqual([
      { kind: 'portion', price: 3100, portion: '90 мл', productId: 'menu-005', productKind: 'cocktail' },
    ]);
  });
});

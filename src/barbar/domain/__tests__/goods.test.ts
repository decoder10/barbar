import { describe, expect, it } from 'vitest';
import { staffData } from '../../../../netlify/lib/barbar-access';
import { businessToday } from '../business-day';
import { mergeGoodsDuplicates, migrateGoodsCatalog } from '../catalog/goods';
import { applyCommand, initialData, stock, validateData } from '../model';
import type { BarData } from '../types';

const converted = (): BarData => {
  const data = initialData();
  const next = migrateGoodsCatalog(data, new Set())!;
  return { ...data, ...next };
};

describe('piece goods sold from stock', () => {
  it('links listed untouched menu items to piece stock and keeps their IDs and prices', () => {
    const data = converted();
    const cola = data.cocktails.find((c) => c.name === 'Cola')!;
    expect(cola).toMatchObject({
      id: 'menu-121',
      stockAlcoholId: 'goods-menu-121',
      ingredients: [{ alcoholId: 'goods-menu-121', ml: 1 }],
    });
    expect(data.alcohol.find((a) => a.id === 'goods-menu-121')).toMatchObject({
      category: 'goods',
      menuCategory: 'soft',
      unit: 'bottle',
      pricePerLiter: 500,
    });
    expect(data.cocktails.find((c) => c.name === 'Juice')?.stockAlcoholId).toBeUndefined();
    expect(data.cocktails.filter((c) => c.stockAlcoholId?.startsWith('goods-'))).toHaveLength(23);
    expect(() => validateData(data)).not.toThrow();
  });

  it('skips items with a recipe or sales', () => {
    const data = initialData();
    data.cocktails = data.cocktails.map((c) =>
      c.name === 'Fanta' ? { ...c, ingredients: [{ alcoholId: 'cola', ml: 330 }] } : c,
    );
    const next = migrateGoodsCatalog(data, new Set(['menu-123']))!;
    expect(next.cocktails.find((c) => c.name === 'Fanta')!.stockAlcoholId).toBeUndefined();
    expect(next.cocktails.find((c) => c.name === 'Sprite')!.stockAlcoholId).toBeUndefined();
  });

  it('needs purchased pieces, deducts one per sale and records «шт.»', () => {
    let data = converted();
    const chips = data.cocktails.find((c) => c.name === 'Chips')!;
    const sell = (id: string) =>
      applyCommand(data, {
        id,
        type: 'sale',
        value: { kind: 'cocktail', productId: chips.id, quantity: 2, date: businessToday() },
      });
    expect(() => sell('empty')).toThrow('Недостаточно');
    data = applyCommand(data, {
      id: 'chips-in',
      type: 'purchase',
      value: {
        id: 'chips-in',
        alcoholId: chips.stockAlcoholId!,
        date: businessToday(),
        ml: 10,
        costPerLiter: 350,
      },
    });
    data = sell('two');
    expect(data.sales.at(-1)).toMatchObject({ unit: 'pcs', cost: 700, revenue: 2000 });
    expect(stock(data, chips.stockAlcoholId!)).toBe(8);
  });

  it('keeps price on the stock item and creates or links a menu item from the stock form', () => {
    let data = converted();
    const goods = data.alcohol.find((a) => a.id === 'goods-menu-126')!;
    data = applyCommand(data, {
      id: 'tonic-price',
      type: 'alcohol',
      value: { ...goods, pricePerLiter: 1100 },
    });
    expect(data.cocktails.find((c) => c.id === 'menu-126')!.price).toBe(1100);
    data = applyCommand(data, {
      id: 'new-goods',
      type: 'alcohol',
      value: {
        id: 'borjomi',
        name: 'Borjomi',
        category: 'goods',
        menuCategory: 'soft',
        unit: 'pcs',
        costPerLiter: 0,
        pricePerLiter: 800,
        color: '#7c8b6a',
      },
    });
    expect(data.cocktails.find((c) => c.id === 'goods-borjomi')).toMatchObject({
      category: 'soft',
      price: 800,
    });
    const juice = data.cocktails.find((c) => c.name === 'Juice')!;
    data = applyCommand(data, {
      id: 'juice-goods',
      type: 'alcohol',
      value: {
        id: 'juice-pack',
        name: 'Juice',
        category: 'goods',
        menuCategory: 'soft',
        unit: 'pcs',
        costPerLiter: 0,
        pricePerLiter: 0,
        color: '#7c8b6a',
      },
    });
    expect(data.cocktails.find((c) => c.id === juice.id)).toMatchObject({
      stockAlcoholId: 'juice-pack',
      price: 500,
    });
    expect(() =>
      applyCommand(data, { id: 'bad', type: 'alcohol', value: { ...goods, unit: 'ml' } }),
    ).toThrow();
    const honey = data.cocktails.find((c) => c.name === 'Honey')!;
    const honeyStock = data.alcohol.find((a) => a.id === honey.stockAlcoholId)!;
    data = applyCommand(data, {
      id: 'honey-grams',
      type: 'alcohol',
      value: { ...honeyStock, unit: 'g', saleAmount: 50 },
    });
    expect(data.cocktails.find((c) => c.id === honey.id)!.ingredients).toEqual([
      { alcoholId: honeyStock.id, ml: 50 },
    ]);
    data = applyCommand(data, {
      id: 'honey-in',
      type: 'purchase',
      value: {
        id: 'honey-in',
        alcoholId: honeyStock.id,
        date: businessToday(),
        ml: 1000,
        costPerLiter: 6000,
      },
    });
    data = applyCommand(data, {
      id: 'honey-sale',
      type: 'sale',
      value: { kind: 'cocktail', productId: honey.id, quantity: 2, date: businessToday() },
    });
    expect(data.sales.at(-1)).toMatchObject({ cost: 600, revenue: 3000 });
    expect(data.sales.at(-1)!.unit).toBeUndefined();
    expect(() =>
      applyCommand(data, {
        id: 'no-amount',
        type: 'alcohol',
        value: { ...honeyStock, id: 'x', name: 'X', unit: 'g' },
      }),
    ).toThrow();
  });

  it('shows workers piece units and hides pieces from recipe editing', () => {
    const data = converted();
    const staff = staffData(data);
    expect(staff.products.find((p) => p.id === 'menu-121')).toMatchObject({ unit: 'bottle', available: 0 });
    expect(staff.products.find((p) => p.id === 'menu-081')).toMatchObject({ unit: 'pcs' });
    expect(staff.recipes.find((r) => r.id === 'menu-121')).toMatchObject({ editable: false });
  });
});

describe('one product, one stock item', () => {
  it('removes unused bar and kitchen duplicates and keeps used ones', () => {
    const data = initialData();
    data.cocktails = data.cocktails.map((c) =>
      c.name === 'Gin tonic Beefeater' ? { ...c, ingredients: [{ alcoholId: 'tonic', ml: 150 }] } : c,
    );
    const next = migrateGoodsCatalog(data, new Set(), new Set(['lemon-fruit']))!;
    const names = next.alcohol.map((a) => a.name);
    // Cola, tonic and soda are merged into their goods by the next step, not removed here.
    expect(names).toContain('Кола');
    expect(names).not.toContain('Мёд');
    expect(names).toContain('Тоник');
    expect(names).toContain('Лимон');
    expect(next.kept).toEqual(['Лимон']);
    expect(next.alcohol.filter((a) => a.name === 'Мёд')).toHaveLength(0);
  });
});

describe('merging a bar drink with its menu goods item', () => {
  it('keeps the ml stock item with its history and removes the unused goods duplicate', () => {
    const data = initialData();
    const converted = migrateGoodsCatalog(data, new Set(), new Set(['tonic']))!;
    // Tonic has purchases: the cleanup kept it, the merge makes it the item behind the menu Tonic.
    const merged = mergeGoodsDuplicates(converted, new Set(['tonic']))!;
    const tonic = merged.alcohol.find((a) => a.id === 'tonic')!;
    expect(tonic).toMatchObject({
      name: 'Tonic',
      category: 'goods',
      unit: 'ml',
      saleAmount: 330,
      menuCategory: 'soft',
      pricePerLiter: 1000,
    });
    expect(merged.cocktails.find((c) => c.name === 'Tonic')).toMatchObject({
      stockAlcoholId: 'tonic',
      ingredients: [{ alcoholId: 'tonic', ml: 330 }],
    });
    expect(merged.alcohol.some((a) => a.id === 'goods-menu-126')).toBe(false);
    expect(merged.alcohol.filter((a) => /^(тоник|tonic)$/i.test(a.name))).toHaveLength(1);
    expect(merged.alcohol.find((a) => a.id === 'soda')?.name).toBe('Water');
    expect(merged.alcohol.some((a) => a.name === 'Содовая')).toBe(false);
    // A database merged earlier under the stock name is renamed on the next run.
    const renamed = mergeGoodsDuplicates(
      { ...merged, alcohol: merged.alcohol.map((a) => (a.id === 'soda' ? { ...a, name: 'Содовая' } : a)) },
      new Set(),
    )!;
    expect(renamed.alcohol.find((a) => a.id === 'soda')?.name).toBe('Water');
    expect(merged.cocktails.find((c) => c.name === 'Water')?.stockAlcoholId).toBe('soda');
    expect(() => validateData({ ...data, ...merged })).not.toThrow();
  });

  it('does not merge a goods item that already has history', () => {
    const converted = migrateGoodsCatalog(initialData(), new Set(), new Set(['tonic']))!;
    const result = mergeGoodsDuplicates(converted, new Set(['tonic', 'goods-menu-126']))!;
    expect(result.kept).toContain('Тоник / Tonic');
    expect(result.alcohol.find((a) => a.id === 'tonic')?.category).toBe('mixer');
  });

  it('preserves a custom menu recipe and references from other recipes and costs', () => {
    const custom = structuredClone(initialData());
    const menu = custom.cocktails.find((c) => c.name === 'Tonic')!;
    menu.ingredients = [{ alcoholId: 'tonic', ml: 200 }];
    const result = mergeGoodsDuplicates(custom, new Set())!;
    expect(result.cocktails.find((c) => c.id === menu.id)).toEqual(menu);
    expect(result.alcohol.find((a) => a.id === 'tonic')?.category).toBe('mixer');

    const converted = migrateGoodsCatalog(initialData(), new Set())!;
    const other = converted.cocktails.find((c) => c.name === 'Juice')!;
    other.extraCosts = [{ alcoholId: 'goods-menu-126', cost: 50 }];
    const protectedResult = mergeGoodsDuplicates(converted, new Set())!;
    expect(protectedResult.alcohol.some((a) => a.id === 'goods-menu-126')).toBe(true);
    expect(protectedResult.cocktails.find((c) => c.id === other.id)).toEqual(other);
  });

  it('consumes part of a bottled goods item in a recipe and restores it on cancellation', () => {
    let data = converted();
    const item = data.alcohol.find((a) => a.id === 'goods-menu-122')!;
    data = applyCommand(data, {
      id: 'bottle-volume',
      type: 'alcohol',
      value: { ...item, bottleSizeMl: 500 },
    });
    data = applyCommand(data, {
      id: 'bottles-in',
      type: 'purchase',
      value: { id: 'bottles-in', alcoholId: item.id, ml: 2, costPerLiter: 1000, date: businessToday() },
    });
    const recipe = data.cocktails.find((c) => c.name === 'Juice')!;
    data = applyCommand(data, {
      id: 'partial-recipe',
      type: 'cocktail',
      value: { ...recipe, ingredients: [{ alcoholId: item.id, ml: 150 / 500 }] },
    });
    data = applyCommand(data, {
      id: 'partial-sale',
      type: 'sale',
      value: { kind: 'cocktail', productId: recipe.id, quantity: 1, date: businessToday() },
    });
    expect(stock(data, item.id)).toBeCloseTo(1.7);
    expect(data.sales.at(-1)?.cost).toBe(300);
    expect(() => validateData(data)).not.toThrow();
    data = applyCommand(data, { id: 'partial-void', type: 'void', saleId: 'partial-sale' });
    expect(stock(data, item.id)).toBe(2);
  });

  it('sells 330 ml of the merged drink and recipes still take ml from it', () => {
    const converted = migrateGoodsCatalog(initialData(), new Set(), new Set(['tonic']))!;
    let data: BarData = { ...initialData(), ...mergeGoodsDuplicates(converted, new Set(['tonic']))! };
    data = applyCommand(data, {
      id: 'tonic-in',
      type: 'purchase',
      value: { id: 'tonic-in', alcoholId: 'tonic', date: businessToday(), ml: 1000, costPerLiter: 1500 },
    });
    const menu = data.cocktails.find((c) => c.name === 'Tonic')!;
    data = applyCommand(data, {
      id: 'tonic-sale',
      type: 'sale',
      value: { kind: 'cocktail', productId: menu.id, quantity: 1, date: businessToday() },
    });
    expect(stock(data, 'tonic')).toBe(670);
    expect(data.sales.at(-1)).toMatchObject({ revenue: 1000, cost: 495 });
  });
});

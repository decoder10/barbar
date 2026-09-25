import { describe, expect, it } from 'vitest';
import { packPriceUnit, priceAmount, toShownPrice, toStoredPrice } from '../catalog/pack-price';
import { applyCommand, averageCost, initialData, recipeCost, stock } from '../model';
import type { Alcohol } from '../types';

const syrup = (packSize?: number): Alcohol => ({
  id: 'pack-syrup',
  name: 'Сироп 500',
  category: 'mixer',
  unit: 'ml',
  ...(packSize ? { packSize } : {}),
  costPerLiter: 0,
  pricePerLiter: 0,
  color: '#8c775b',
});

describe('prices per package', () => {
  it('stores a package price per 1,000 ml and shows it back unchanged', () => {
    const item = syrup(500);
    expect(priceAmount(item)).toBe(500);
    expect(packPriceUnit(item)).toBe('500 мл');
    expect(toStoredPrice(700, item)).toBe(1400);
    expect(toShownPrice(1400, item)).toBe(700);
    for (const [packSize, entered] of [
      [300, 700],
      [330, 450],
      [250, 99.99],
      [750, 3333.33],
    ])
      expect(toShownPrice(toStoredPrice(entered, syrup(packSize)), syrup(packSize))).toBe(entered);
  });

  it('keeps the stored basis without a package and for bottles and goods', () => {
    expect(priceAmount(syrup())).toBe(1000);
    expect(packPriceUnit(syrup())).toBe('1 000 мл');
    expect(toStoredPrice(1400, syrup())).toBe(1400);
    const beer: Alcohol = { ...syrup(500), category: 'beer', unit: 'bottle' };
    expect(priceAmount(beer)).toBe(1);
    expect(toStoredPrice(900, beer)).toBe(900);
    const goods: Alcohol = { ...syrup(500), category: 'goods', menuCategory: 'soft', saleAmount: 250 };
    expect(priceAmount(goods)).toBe(1000);
    expect(toShownPrice(1400, goods)).toBe(1400);
  });

  it('prices pieces per pack and stores the price of one piece', () => {
    const lavash: Alcohol = { ...syrup(10), category: 'food', unit: 'pcs' };
    expect(packPriceUnit(lavash)).toBe('10 шт.');
    expect(toStoredPrice(1500, lavash)).toBe(150);
    expect(toShownPrice(150, lavash)).toBe(1500);
  });

  it('validates the package and keeps stock and recipe costs in the stored basis', () => {
    const data = initialData();
    let next = applyCommand(data, { id: 'pack-1', type: 'alcohol', value: syrup(500) });
    expect(next.alcohol.find((a) => a.id === 'pack-syrup')!.packSize).toBe(500);
    for (const bad of [
      { ...syrup(500), packSize: 2.5 },
      { ...syrup(500), packSize: 0 },
      { ...syrup(500), packSize: 10001 },
      { ...syrup(500), category: 'beer' as const, unit: 'bottle' as const },
      { ...syrup(500), category: 'goods' as const, menuCategory: 'soft' as const, saleAmount: 250 },
    ])
      expect(() => applyCommand(data, { id: 'pack-bad', type: 'alcohol', value: bad })).toThrow();
    const item = next.alcohol.find((a) => a.id === 'pack-syrup')!;
    next = applyCommand(next, {
      id: 'pack-purchase',
      type: 'purchase',
      value: {
        id: 'pack-purchase',
        alcoholId: item.id,
        ml: 500,
        costPerLiter: toStoredPrice(700, item),
        date: '2026-09-01',
      },
    });
    expect(stock(next, item.id)).toBe(500);
    expect(averageCost(next, item.id)).toBe(1400);
    expect(recipeCost(next, [{ alcoholId: item.id, ml: 30 }])).toBe(42);
  });
});

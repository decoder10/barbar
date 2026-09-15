import { describe, expect, it } from 'vitest';
import { migrateGoodsCatalog } from '../catalog/goods';
import { inventoryGroup } from '../inventory-groups';
import { initialData } from '../model';

const group = (name: string, category = 'mixer', extra = {}) =>
  inventoryGroup({ name, category: category as never, ...extra });

describe('product groups follow what the product is', () => {
  it('groups drinks, juices, tea, dairy, fruit and vegetables', () => {
    expect(group('Кола')).toBe('soft');
    expect(group('Tonic', 'goods')).toBe('soft');
    expect(group('Томатный сок')).toBe('juice');
    expect(group('Гренадин')).toBe('juice');
    expect(group('Black tea', 'goods')).toBe('tea');
    expect(group('Сливки')).toBe('dairy');
    expect(group('Сливочное масло', 'food')).toBe('dairy');
    expect(group('Слива')).toBe('fruit');
    expect(group('Барбарис')).toBe('fruit');
    expect(group('Мята')).toBe('vegetables');
    expect(group('Маринованные огурцы', 'food')).toBe('grocery');
    expect(group('Огурцы', 'food')).toBe('vegetables');
  });
  it('separates meat and cheese, bread and snacks; owner choice wins', () => {
    expect(group('Суджук', 'food')).toBe('meat');
    expect(group('Сыр Микаелян', 'food')).toBe('meat');
    expect(group('Лаваш', 'food')).toBe('bakery');
    expect(group('Chips', 'goods')).toBe('snacks');
    expect(group('Jerky', 'goods')).toBe('snacks');
    expect(group('Honey', 'goods')).toBe('grocery');
    expect(group('Лёд')).toBe('other');
    expect(group('Vodka', 'alcohol')).toBe('alcohol');
    expect(group('Мой сироп', 'mixer', { group: 'fruit' })).toBe('fruit');
  });
  it('leaves no default stock item in «other» except ice', () => {
    const data = initialData();
    const next = migrateGoodsCatalog(data, new Set())!;
    const other = next.alcohol.filter((a) => inventoryGroup(a) === 'other').map((a) => a.name);
    expect(other).toEqual(['Лёд']);
  });
});

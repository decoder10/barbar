import { describe, expect, it } from 'vitest';
import { staffCardPage } from '../cards';

const products = [
  {
    id: 'a',
    kind: 'cocktail' as const,
    name: 'Negroni',
    category: 'cocktail',
    price: 2900,
    available: 0,
    ready: true,
  },
  {
    id: 'b',
    kind: 'cocktail' as const,
    name: 'Aperol Spritz',
    category: 'cocktail',
    price: 2900,
    available: 4,
    ready: true,
  },
  {
    id: 'c',
    kind: 'cocktail' as const,
    name: 'Your cocktail',
    category: 'cocktail',
    price: 0,
    available: null,
    ready: false,
  },
  {
    id: 'd',
    kind: 'alcohol' as const,
    name: 'Vodka',
    category: 'alcohol',
    price: 18,
    available: 700,
    ready: true,
  },
];
const query = {
  resource: 'cocktails' as const,
  category: 'all',
  search: '',
  sort: 'original' as const,
  offset: 0,
  limit: 2,
};

describe('worker card pages without the server read model', () => {
  it('pages cocktails and poured alcohol separately', () => {
    const first = staffCardPage(products, query);
    expect(first).toMatchObject({ ids: ['a', 'b'], total: 3, nextOffset: 2 });
    expect(staffCardPage(products, { ...query, offset: 2 })).toMatchObject({ ids: ['c'], nextOffset: null });
    expect(staffCardPage(products, { ...query, resource: 'alcohol' }).ids).toEqual(['d']);
  });
  it('sorts available and popular items across all pages and searches by name', () => {
    expect(staffCardPage(products, { ...query, sort: 'available', limit: 1 }).ids).toEqual(['b']);
    expect(
      staffCardPage(products, { ...query, sort: 'popular', limit: 1 }, new Map([['cocktail:c', 3]])).ids,
    ).toEqual(['c']);
    expect(staffCardPage(products, { ...query, search: 'SPRITZ' }).ids).toEqual(['b']);
  });
});

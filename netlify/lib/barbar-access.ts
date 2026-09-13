import { portions, stock } from '../../src/barbar/model';
import type { BarData, Role, StaffData } from '../../src/barbar/types';

export function staffData(data: BarData): StaffData {
  return {
    ingredients: data.alcohol.map(({ id, name, unit }) => ({ id, name, unit: unit || 'ml' })),
    products: [
      ...data.cocktails.map((c) => ({
        id: c.id,
        kind: 'cocktail' as const,
        name: c.name,
        category: c.category || ('cocktail' as const),
        image: c.image,
        available: c.ingredients.length ? portions(data, c.ingredients) : null,
        ready: c.price > 0 && (c.ingredients.length > 0 || !!c.extraCosts?.length),
      })),
      ...data.alcohol
        .filter((a) => a.category === 'alcohol')
        .map((a) => ({
          id: a.id,
          kind: 'alcohol' as const,
          name: a.name,
          category: 'alcohol' as const,
          available: stock(data, a.id),
          ready: a.pricePerLiter > 0,
        })),
    ],
    sales: data.sales.map(({ id, date, createdAt, kind, productId, name, quantity, voided }) => ({
      id,
      date,
      createdAt,
      kind,
      productId,
      name,
      quantity,
      voided,
    })),
    ...(data.archived ? { archivedBefore: data.archived.before } : {}),
  };
}
export const publicSnapshot = (data: BarData, revision: string | null | undefined, role: Role) =>
  role === 'admin' ? { data, revision, role } : { staffData: staffData(data), revision, role };

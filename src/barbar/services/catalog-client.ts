import { api } from './api-client';
import type { CatalogPartResponse, CatalogResponse } from '../domain/sync/contracts';

export function assembleCatalog(
  alcohol: CatalogPartResponse,
  cocktails: CatalogPartResponse,
): CatalogResponse {
  if (
    alcohol.resource !== 'alcohol' ||
    cocktails.resource !== 'cocktails' ||
    alcohol.role !== cocktails.role ||
    alcohol.catalogRevision !== cocktails.catalogRevision
  ) {
    throw new Error('Каталог изменился во время загрузки. Повторите обновление.');
  }
  const common = { role: alcohol.role, catalogRevision: alcohol.catalogRevision };
  if (alcohol.role === 'admin') {
    if (!alcohol.alcohol || !cocktails.cocktails) throw new Error('Не удалось загрузить каталог.');
    return { ...common, data: { alcohol: alcohol.alcohol, cocktails: cocktails.cocktails } };
  }
  if (!alcohol.ingredients || !alcohol.products || !cocktails.recipes || !cocktails.products)
    throw new Error('Не удалось загрузить каталог.');
  const ingredients = new Map(alcohol.ingredients.map((i) => [i.id, i]));
  return {
    ...common,
    staffData: {
      paged: true,
      ingredients: alcohol.ingredients,
      recipes: cocktails.recipes,
      products: [
        ...cocktails.products.map((p) => {
          // Serving metadata comes from the separate, safe ingredient resource.
          const ingredient = p.stockAlcoholId ? ingredients.get(p.stockAlcoholId) : undefined;
          return p.unit === 'glass' && ingredient
            ? {
                ...p,
                glassSizeMl: ingredient.glassSizeMl,
                bottleSizeMl: ingredient.bottleSizeMl,
                availableMl: 0,
              }
            : p;
        }),
        ...alcohol.products,
      ],
      sales: [],
    },
  };
}

export async function readCatalog(): Promise<CatalogResponse> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [alcohol, cocktails] = await Promise.all([
      api('/api/barbar/catalog/alcohol'),
      api('/api/barbar/catalog/cocktails'),
    ]);
    if (alcohol.role === cocktails.role && alcohol.catalogRevision === cocktails.catalogRevision)
      return assembleCatalog(alcohol, cocktails);
  }
  throw new Error('Каталог изменился во время загрузки. Повторите обновление.');
}

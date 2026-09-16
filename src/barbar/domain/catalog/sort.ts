/** Pure catalog ordering shared by the browser and server card pages. */
export type CatalogSort =
  'original' | 'name' | 'name-desc' | 'available' | 'missing' | 'popular' | 'recipe' | 'price' | 'price-desc';
export interface SortItem {
  name: string;
  available?: number;
  popularity?: number;
  recipeMissing?: boolean;
  price?: number;
}
export function compareCatalog(a: SortItem, b: SortItem, sort: CatalogSort) {
  const name = () => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
  if (sort === 'original') return 0;
  if (sort === 'name-desc') return -name();
  if (sort === 'available' || sort === 'missing')
    return (
      (Number((b.available ?? 0) > 0) - Number((a.available ?? 0) > 0)) * (sort === 'missing' ? -1 : 1) ||
      name()
    );
  // Equally popular items keep the menu order: a stable sort leaves them where the catalog puts them.
  if (sort === 'popular') return (b.popularity || 0) - (a.popularity || 0);
  if (sort === 'recipe') return Number(b.recipeMissing) - Number(a.recipeMissing) || name();
  if (sort === 'price' || sort === 'price-desc')
    return ((a.price || 0) - (b.price || 0)) * (sort === 'price-desc' ? -1 : 1) || name();
  return name();
}

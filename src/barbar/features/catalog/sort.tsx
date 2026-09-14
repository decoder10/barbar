import { useState } from 'react';
import { t } from '../../i18n/runtime';
export type CatalogSort =
  'original' | 'name' | 'name-desc' | 'available' | 'missing' | 'popular' | 'recipe' | 'price' | 'price-desc';
export interface SortItem {
  name: string;
  available?: number;
  popularity?: number;
  recipeMissing?: boolean;
  price?: number;
}
const labels: Record<CatalogSort, string> = {
  original: 'Порядок меню',
  name: 'По названию А–Я',
  'name-desc': 'По названию Я–А',
  available: 'Сначала доступные',
  missing: 'Сначала отсутствующие',
  popular: 'Чаще продаются за день',
  recipe: 'Сначала без рецепта',
  price: 'Цена по возрастанию',
  'price-desc': 'Цена по убыванию',
};
export function compareCatalog(a: SortItem, b: SortItem, sort: CatalogSort) {
  const name = () => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
  if (sort === 'original') return 0;
  if (sort === 'name-desc') return -name();
  if (sort === 'available' || sort === 'missing')
    return (
      (Number((b.available ?? 0) > 0) - Number((a.available ?? 0) > 0)) * (sort === 'missing' ? -1 : 1) ||
      name()
    );
  if (sort === 'popular') return (b.popularity || 0) - (a.popularity || 0) || name();
  if (sort === 'recipe') return Number(b.recipeMissing) - Number(a.recipeMissing) || name();
  if (sort === 'price' || sort === 'price-desc')
    return ((a.price || 0) - (b.price || 0)) * (sort === 'price-desc' ? -1 : 1) || name();
  return name();
}
export function useCatalogSort(key: string, initial: CatalogSort = 'original') {
  return useState<CatalogSort>(() => {
    try {
      const value = localStorage.getItem(`barbar-sort-${key}`) as CatalogSort;
      return value in labels ? value : initial;
    } catch {
      return initial;
    }
  });
}
export function CatalogSortControl({
  value,
  onChange,
  storageKey,
  options,
}: {
  value: CatalogSort;
  onChange: (value: CatalogSort) => void;
  storageKey: string;
  options: CatalogSort[];
}) {
  return (
    <label className="catalog-sort">
      <span>{t('Сортировка')}</span>
      <select
        aria-label={t('Сортировка')}
        value={options.includes(value) ? value : options[0]}
        onChange={(e) => {
          const next = e.target.value as CatalogSort;
          onChange(next);
          try {
            localStorage.setItem(`barbar-sort-${storageKey}`, next);
          } catch {
            /* Private browsing may disable storage. */
          }
        }}
      >
        {t(
          options.map((option) => (
            <option key={option} value={option}>
              {t(labels[option])}
            </option>
          )),
        )}
      </select>
    </label>
  );
}

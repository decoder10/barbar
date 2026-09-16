import { useSessionFilter } from '../../presentation/use-session-filter';
import { t } from '../../presentation/i18n/runtime';
import { compareCatalog, type CatalogSort, type SortItem } from '../../domain/catalog/sort';
export { compareCatalog, type CatalogSort, type SortItem };
const labels: Record<CatalogSort, string> = {
  original: 'Порядок меню',
  name: 'По названию А–Я',
  'name-desc': 'По названию Я–А',
  available: 'Сначала доступные',
  missing: 'Сначала отсутствующие',
  popular: 'Сначала самые продаваемые',
  recipe: 'Сначала без рецепта',
  price: 'Цена по возрастанию',
  'price-desc': 'Цена по убыванию',
};

/** Sales screens open on the most sold items; other catalogs keep the menu order. */
export const salesSortDefault: CatalogSort = 'popular';
export function useCatalogSort(key: string, initial: CatalogSort = 'original') {
  return useSessionFilter<CatalogSort>(
    `sort-${key}`,
    initial,
    (value): value is CatalogSort => typeof value === 'string' && Object.hasOwn(labels, value),
  );
}
export function CatalogSortControl({
  value,
  onChange,
  options,
}: {
  value: CatalogSort;
  onChange: (value: CatalogSort) => void;
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

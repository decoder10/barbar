import { CategoryTabs } from '../../ui/category-tabs';
import {
  inventoryGroup,
  inventoryGroupHints,
  inventoryGroups,
  type InventoryGroup,
} from '../../domain/inventory-groups';
import type { Alcohol } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';

export function InventoryCategories({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: (Pick<Alcohol, 'category' | 'name'> & { group?: string })[];
}) {
  const present = new Set(items.map((item) => inventoryGroup(item)));
  const hint = inventoryGroupHints[value as InventoryGroup];
  return (
    <>
      <CategoryTabs
        className="segmented inventory-categories"
        value={value}
        onChange={onChange}
        label="Группа склада"
        options={[
          ['all', 'Все'] as const,
          ...inventoryGroups.filter(([id]) => present.has(id) || id === value),
        ]}
      />
      {hint && <p className="inventory-category-hint">{t(hint)}</p>}
    </>
  );
}

import { TriangleAlert } from 'lucide-react';
import { unitLabel } from '../../domain/model';
import { ingredientFits, ingredientGroups, isFoodMenu } from '../../domain/recipe-ingredients';
import type { Alcohol, MenuCategory } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';

type Item = Pick<Alcohol, 'id' | 'name' | 'category'> & { unit?: Alcohol['unit']; group?: string };

/** Grouped options for one recipe row. A saved ingredient from another group stays selectable. */
export function IngredientOptions({
  items,
  category,
  current,
  taken,
}: {
  items: Item[];
  category?: MenuCategory;
  current: string;
  taken: Set<string>;
}) {
  const selected = items.find((a) => a.id === current);
  const groups = ingredientGroups(
    items.filter((a) => a.id === current || !taken.has(a.id)),
    category,
  );
  return (
    <>
      {!current && (
        <option value="">{t(isFoodMenu(category) ? 'Выберите продукт' : 'Выберите ингредиент')}</option>
      )}
      {selected && !ingredientFits(selected, category) && (
        <optgroup label={t('Сохранённый ингредиент')}>
          <option value={selected.id}>
            {t(selected.name)} · {t(unitLabel(selected.unit))}
          </option>
        </optgroup>
      )}
      {groups.map((group) => (
        <optgroup key={group.label} label={t(group.label)}>
          {group.items
            .filter((a) => a.id !== selected?.id || ingredientFits(selected, category))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {t(a.name)} · {t(unitLabel(a.unit))}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

export function IngredientMismatch({ item, category }: { item?: Item; category?: MenuCategory }) {
  if (ingredientFits(item, category)) return null;
  return (
    <p className="form-warning ingredient-mismatch">
      <TriangleAlert size={14} aria-hidden="true" />
      {t(
        isFoodMenu(category)
          ? 'Это ингредиент для напитков. Проверьте состав закуски и выберите продукт.'
          : 'Это продукт для закусок. Проверьте состав напитка.',
      )}
    </p>
  );
}

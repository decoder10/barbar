import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { round, unitLabel } from '../../domain/model';
import {
  defaultIngredientAmount,
  ingredientFits,
  isFoodMenu,
  mlPerPiece,
} from '../../domain/recipe-ingredients';
import type { Alcohol, Ingredient, MenuCategory } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { IngredientMismatch, IngredientOptions } from './IngredientOptions';

type Item = Pick<Alcohol, 'id' | 'name' | 'category'> & {
  unit?: Alcohol['unit'];
  group?: string;
  bottleSizeMl?: number;
};

const amountLabel = { bottle: 'Бутылки', pcs: 'Штуки', g: 'Граммы', ml: 'Миллилитры' };

/** Recipe rows shared by the owner and worker editors: grouped picker, amount in the item unit, mismatch hint. */
export function IngredientRows<T extends Item>({
  ingredients,
  items,
  category,
  taken,
  disabled,
  drinkDefault,
  onChange,
  note,
}: {
  ingredients: Ingredient[];
  items: T[];
  category?: MenuCategory;
  taken: Set<string>;
  disabled?: boolean;
  /** Starting amount for a drink ingredient in ml. */
  drinkDefault: number;
  onChange: (ingredients: Ingredient[]) => void;
  /** Extra line under a row, e.g. a stock shortage. */
  note?: (item: T | undefined, ingredient: Ingredient) => ReactNode;
}) {
  const find = (id: string) => items.find((a) => a.id === id);
  const update = (index: number, value: Partial<Ingredient>) =>
    onChange(ingredients.map((item, i) => (i === index ? { ...item, ...value } : item)));
  return (
    <>
      <div className="ingredient-label">
        <span>{t('Ингредиенты')}</span>
        <small>{t('Количество на одну порцию')}</small>
      </div>
      {ingredients.map((ingredient, index) => {
        const item = find(ingredient.alcoholId);
        const perMl = mlPerPiece(item);
        return (
          <div className="ingredient-row" key={index}>
            <div className="ingredient-inputs">
              <select
                aria-label={t(`Ингредиент ${index + 1}`)}
                required
                disabled={disabled}
                value={ingredient.alcoholId}
                onChange={(e) =>
                  update(index, {
                    alcoholId: e.target.value,
                    ml: defaultIngredientAmount(find(e.target.value)?.unit, category, drinkDefault),
                  })
                }
              >
                <IngredientOptions
                  items={items}
                  category={category}
                  current={ingredient.alcoholId}
                  taken={taken}
                />
              </select>
              <label>
                <input
                  aria-label={t(
                    `${perMl ? 'Миллилитры' : amountLabel[item?.unit || 'ml']} ингредиента ${index + 1}`,
                  )}
                  disabled={disabled}
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  required
                  value={ingredient.ml ? round(ingredient.ml * (perMl || 1)) : ''}
                  onChange={(e) => update(index, { ml: Number(e.target.value) / (perMl || 1) })}
                />
                <span>{t(perMl ? 'мл' : unitLabel(item?.unit))}</span>
              </label>
              <button
                type="button"
                className="icon-button"
                disabled={disabled}
                aria-label={t(`Удалить ингредиент ${index + 1}`)}
                onClick={() => onChange(ingredients.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} />
              </button>
            </div>
            {!disabled && <IngredientMismatch item={item} category={category} />}
            {note?.(item, ingredient)}
          </div>
        );
      })}
      <button
        className="text-link add-ingredient"
        type="button"
        disabled={
          disabled ||
          ingredients.length >= Math.min(30, items.length) ||
          ingredients.some((i) => !i.alcoholId)
        }
        onClick={() => {
          // Snacks start with an explicit product choice instead of the first drink ingredient.
          const next = isFoodMenu(category)
            ? undefined
            : items.find((a) => ingredientFits(a, category) && !taken.has(a.id));
          onChange([
            ...ingredients,
            next
              ? { alcoholId: next.id, ml: defaultIngredientAmount(next.unit, category, drinkDefault) }
              : { alcoholId: '', ml: 0 },
          ]);
        }}
      >
        <Plus size={15} />
        {t(' Добавить ингредиент')}
      </button>
    </>
  );
}

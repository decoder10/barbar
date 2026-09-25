import { useState } from 'react';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { FormSteps } from '../../ui/form-steps';
import { recipeCategories, unitLabel } from '../../domain/model';
import { barConfig } from '../../config';
import { mlPerPiece } from '../../domain/recipe-ingredients';
import type { Ingredient, MenuCategory, StaffRecipe } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';
import { ShortageNote } from '../inventory/InventoryProduct';
import { IngredientRows } from './IngredientRows';
import { PhotoPicker } from './PhotoPicker';

/** Worker editor: the owner's layout without prices, costs or set composition, which only the owner changes. */
export default function StaffCocktailForm({ close, recipe }: { close: () => void; recipe?: StaffRecipe }) {
  const { staffData, run } = useBar();
  const [name, setName] = useState(recipe?.name || '');
  const [category, setCategory] = useState<MenuCategory>(recipe?.category || 'cocktail');
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients.map((i) => ({ ...i })) || [],
  );
  const [notes, setNotes] = useState(recipe?.notes || '');
  const [image, setImage] = useState(recipe?.image || 0);
  const catalog = (staffData?.ingredients || []).filter((a) => !recipe?.managedIngredientIds.includes(a.id));
  const readonly = recipe?.editable === false;
  const menuCategory = recipe?.category || category;
  const isSet = menuCategory === barConfig.menu.sets.category;
  // New sets need tinctures chosen by the owner, so workers create other categories only.
  const creatable = recipeCategories.filter((c) => c.id !== barConfig.menu.sets.category);
  return (
    <Modal
      title={t(recipe ? 'Редактировать позицию' : 'Новая позиция меню')}
      subtitle={
        readonly
          ? 'Марка, объём бутылки и порции настраиваются в разделе «Склад».'
          : 'Соберите рецепт из вашего каталога ингредиентов.'
      }
      close={close}
    >
      <FormSteps
        onSubmit={async (e) => {
          e.preventDefault();
          if (readonly) return;
          if (
            await run(
              recipe
                ? {
                    type: 'updateRecipe',
                    cocktailId: recipe.id,
                    ingredients,
                    notes,
                    expected: { ingredients: recipe.ingredients, notes: recipe.notes || '' },
                  }
                : { type: 'createCocktail', value: { name, category, ingredients, notes, image } },
              recipe ? 'Рецепт сохранён.' : 'Позиция добавлена. Владелец сможет подготовить её к продаже.',
            )
          )
            close();
        }}
        submit={
          readonly ? null : (
            <Submit
              disabled={
                !name.trim() ||
                (!ingredients.length &&
                  !recipe?.managedIngredientIds.length &&
                  !recipe?.noIngredients &&
                  !recipe?.components?.length)
              }
            >
              {t('Сохранить позицию')}
            </Submit>
          )
        }
        steps={[
          {
            title: 'Основное',
            content: (
              <>
                <Field label="Название позиции">
                  <input
                    required
                    maxLength={80}
                    disabled={!!recipe}
                    value={name}
                    placeholder={t('Например, Barbar Sunset')}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Категория меню">
                  <select
                    disabled={!!recipe}
                    value={menuCategory}
                    onChange={(e) => setCategory(e.target.value as MenuCategory)}
                  >
                    {(recipe ? recipeCategories : creatable).map((c) => (
                      <option key={c.id} value={c.id}>
                        {t(c.label)}
                      </option>
                    ))}
                  </select>
                </Field>
                <PhotoPicker
                  value={{ name, category: menuCategory, image, photo: recipe?.photo }}
                  onChange={setImage}
                  readOnly={!!recipe}
                />
              </>
            ),
          },
          {
            title: 'Состав',
            content: (
              <>
                {isSet ? (
                  <>
                    <div className="ingredient-label">
                      <span>{t('Состав сета')}</span>
                      <small>{t('Настойки и количество шотов')}</small>
                    </div>
                    <p className="form-help">
                      {(recipe?.components || [])
                        .map(
                          (p) =>
                            `${staffData?.recipes.find((r) => r.id === p.cocktailId)?.name || p.cocktailId} × ${p.quantity}`,
                        )
                        .join(', ')}
                      {t(
                        recipe?.components?.length
                          ? '. Состав сета меняет владелец.'
                          : 'Состав сета настраивает владелец.',
                      )}
                    </p>
                  </>
                ) : recipe?.noIngredients ? (
                  <p className="form-help">
                    {t('Позиция без ингредиентов: продаётся как есть, склад не списывается.')}
                  </p>
                ) : (
                  <IngredientRows
                    ingredients={ingredients}
                    items={catalog}
                    category={menuCategory}
                    taken={new Set(ingredients.map((i) => i.alcoholId))}
                    disabled={readonly}
                    drinkDefault={50}
                    onChange={setIngredients}
                    note={(item, ingredient) => {
                      if (!ingredient.alcoholId || (item?.available || 0) + 1e-7 >= ingredient.ml)
                        return null;
                      const perMl = mlPerPiece(item);
                      return (
                        <ShortageNote>
                          {t(
                            item?.available
                              ? `Не хватает на порцию. В наличии: ${Math.round(item.available * (perMl || 1) * 100) / 100} ${perMl ? 'мл' : unitLabel(item.unit)}`
                              : 'Нет в наличии',
                          )}
                        </ShortageNote>
                      );
                    }}
                  />
                )}
                {!!recipe?.managedIngredientIds.length && (
                  <p className="form-help">
                    {t('Дополнительно настроены администратором:')}
                    {t(' ')}
                    {recipe.managedIngredientIds
                      .map((id) => staffData?.ingredients.find((a) => a.id === id)?.name)
                      .join(', ')}
                    .
                  </p>
                )}
                <Field label="Заметка о рецепте">
                  <input
                    readOnly={readonly}
                    maxLength={1000}
                    value={notes}
                    placeholder={t('Укажите выход порции, особенности приготовления…')}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
                {readonly ? (
                  <p className="form-help">
                    {t('Позиция связана со складом. Для изменения состава обратитесь к администратору.')}
                  </p>
                ) : (
                  !recipe && (
                    <p className="form-help">
                      {t('После настройки администратором коктейль станет доступен для продажи.')}
                    </p>
                  )
                )}
              </>
            ),
          },
        ]}
      />
    </Modal>
  );
}

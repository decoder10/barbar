import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { CocktailArt, Field, Modal, Submit } from '../../components';
import { categories } from '../../domain/model';
import type { Ingredient, MenuCategory, StaffRecipe } from '../../domain/types';
import { t } from '../../i18n/runtime';
import { menuImage, menuPhotos, photoGroups } from '../../images';
import { useBar } from '../../store';

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
  const available = catalog.filter((a) => !ingredients.some((i) => i.alcoholId === a.id));
  const update = (index: number, value: Partial<Ingredient>) =>
    setIngredients(ingredients.map((item, i) => (i === index ? { ...item, ...value } : item)));
  return (
    <Modal
      title={t(recipe ? recipe.name : 'Добавить коктейль')}
      subtitle="Состав на одну порцию и способ приготовления"
      close={close}
    >
      <form
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
              recipe
                ? 'Рецепт сохранён.'
                : 'Коктейль добавлен. Администратор сможет подготовить его к продаже.',
            )
          )
            close();
        }}
      >
        {t(
          !recipe && (
            <>
              <Field label="Название коктейля">
                <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Категория">
                <select value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)}>
                  {t(
                    categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {t(c.label)}
                      </option>
                    )),
                  )}
                </select>
              </Field>
              <Field label="Изображение">
                <select value={image} onChange={(e) => setImage(Number(e.target.value))}>
                  <option value={0}>{t('Подобрать по названию')}</option>
                  {t(
                    photoGroups.map((group, index) => (
                      <optgroup key={group.file} label={group.label}>
                        {t(
                          menuPhotos
                            .filter((p) => p.sheet === index)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {t(p.name)}
                              </option>
                            )),
                        )}
                      </optgroup>
                    )),
                  )}
                </select>
              </Field>
            </>
          ),
        )}
        <div className="staff-recipe-preview">
          <CocktailArt
            image={menuImage({ name, category, image })}
            name={name || 'Новый коктейль'}
            category={category}
          />
        </div>
        <div className="ingredient-label">
          <span>{t('Ингредиенты')}</span>
          <small>{t('Количество на одну порцию')}</small>
        </div>
        {t(
          ingredients.map((ingredient, index) => {
            const currentIngredient = catalog.find((a) => a.id === ingredient.alcoholId);
            const missing = (currentIngredient?.available || 0) + 1e-7 < ingredient.ml;
            const unit =
              catalog.find((a) => a.id === ingredient.alcoholId)?.unit === 'bottle'
                ? 'бут.'
                : catalog.find((a) => a.id === ingredient.alcoholId)?.unit === 'g'
                  ? 'г'
                  : 'мл';
            return (
              <div className="staff-recipe-ingredient" key={index}>
                <div className="ingredient-inputs">
                  <select
                    aria-label={t(`Ингредиент ${index + 1}`)}
                    required
                    disabled={readonly}
                    value={ingredient.alcoholId}
                    onChange={(e) =>
                      update(index, {
                        alcoholId: e.target.value,
                        ml: catalog.find((a) => a.id === e.target.value)?.unit === 'bottle' ? 1 : 50,
                      })
                    }
                  >
                    {t(
                      catalog
                        .filter(
                          (a) =>
                            a.id === ingredient.alcoholId || !ingredients.some((i) => i.alcoholId === a.id),
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {t(a.name)}
                          </option>
                        )),
                    )}
                  </select>
                  <label>
                    <input
                      aria-label={t(`Количество ингредиента ${index + 1}, ${unit}`)}
                      type="number"
                      required
                      disabled={readonly}
                      min="0.01"
                      max="1000000"
                      step="0.01"
                      value={ingredient.ml || ''}
                      onChange={(e) => update(index, { ml: Number(e.target.value) })}
                    />
                    <span>{t(unit)}</span>
                  </label>
                  {t(
                    !readonly && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t(`Удалить ингредиент ${index + 1}`)}
                        onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
                      >
                        <Trash2 size={16} />
                      </button>
                    ),
                  )}
                </div>
                {t(
                  missing && (
                    <p className="staff-recipe-missing">
                      <TriangleAlert size={14} aria-hidden="true" />
                      {t(
                        currentIngredient?.available
                          ? `Не хватает на порцию. В наличии: ${currentIngredient.available} ${unit}`
                          : 'Нет в наличии',
                      )}
                    </p>
                  ),
                )}
              </div>
            );
          }),
        )}
        {t(
          !readonly && (
            <button
              type="button"
              className="button secondary full"
              disabled={!available.length || ingredients.length >= 30}
              onClick={() =>
                setIngredients([
                  ...ingredients,
                  { alcoholId: available[0].id, ml: available[0].unit === 'bottle' ? 1 : 50 },
                ])
              }
            >
              <Plus size={16} />
              {t(' Добавить ингредиент')}
            </button>
          ),
        )}
        <Field label="Как приготовить">
          <textarea
            readOnly={readonly}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {t(
          !!recipe?.managedIngredientIds.length && (
            <p className="form-help">
              {t('Дополнительно настроены администратором:')}
              {t(' ')}
              {t(
                recipe.managedIngredientIds
                  .map((id) => staffData?.ingredients.find((a) => a.id === id)?.name)
                  .join(', '),
              )}
              .
            </p>
          ),
        )}
        {t(
          readonly ? (
            <p className="form-help">
              {t('Позиция связана со складом. Для изменения состава обратитесь к администратору.')}
            </p>
          ) : (
            <>
              {t(
                !recipe && (
                  <p className="form-help">
                    {t('После настройки администратором коктейль станет доступен для продажи.')}
                  </p>
                ),
              )}
              <Submit
                disabled={!name.trim() || (!ingredients.length && !recipe?.managedIngredientIds.length)}
              >
                {t(recipe ? 'Сохранить рецепт' : 'Сохранить коктейль')}
              </Submit>
            </>
          ),
        )}
      </form>
    </Modal>
  );
}

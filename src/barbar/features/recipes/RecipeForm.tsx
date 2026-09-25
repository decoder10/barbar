import { useInventoryCalculations } from '../inventory/use-inventory-calculations';
import { Calculator, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { FormSteps } from '../../ui/form-steps';
import { formatMoney as money } from '../../presentation/currency/format-money';
import {
  ingredientVolume,
  priceBasis,
  menuCategoryConfig,
  recipeCategories,
  round,
  uid,
} from '../../domain/model';
import { expandExtraCosts, expandRecipe, shotsInSet } from '../../domain/catalog/sets';
import { withPhoto } from '../../domain/catalog/uploaded-photos';
import type { Cocktail } from '../../domain/types';
import { barConfig } from '../../config';
import { isFoodMenu } from '../../domain/recipe-ingredients';
import { IngredientRows } from './IngredientRows';
import { PhotoPicker } from './PhotoPicker';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';

export function RecipeForm({ cocktail, close }: { cocktail?: Cocktail; close: () => void }) {
  const { data, run } = useBar();
  const inventory = useInventoryCalculations(data);
  const [value, setValue] = useState<Cocktail>(
    cocktail
      ? JSON.parse(JSON.stringify(cocktail))
      : { id: uid(), name: '', category: 'cocktail', price: 0, ingredients: [], image: 0 },
  );
  const [markup, setMarkup] = useState('200');
  const isSet = value.category === barConfig.menu.sets.category;
  // A set costs and deducts the recipes of its tinctures; other items use their own recipe.
  const recipeLines = isSet ? expandRecipe(value, data.cocktails) : value.ingredients;
  const extraLines = isSet ? expandExtraCosts(value, data.cocktails) : value.extraCosts || [];
  const cost = value.noIngredients
    ? round(value.portionCost || 0)
    : inventory.recipeCost(recipeLines, extraLines);
  const ready = value.noIngredients
    ? (value.portionCost || 0) > 0
    : inventory.recipeReady(recipeLines, extraLines);
  const tinctures = data.cocktails.filter((c) => c.category === barConfig.menu.sets.componentCategory);
  const components = value.components || [];
  const setComponents = (next: typeof components) => setValue({ ...value, components: next });
  const suggested = Math.ceil((cost * (1 + Number(markup) / 100)) / 50) * 50;
  const taken = new Set([
    ...value.ingredients.map((i) => i.alcoholId),
    ...(value.extraCosts || []).map((i) => i.alcoholId),
  ]);
  return (
    <Modal
      title={t(cocktail ? 'Редактировать позицию' : 'Новая позиция меню')}
      subtitle={
        value.stockAlcoholId
          ? 'Марка, объём бутылки и порции настраиваются в разделе «Склад».'
          : 'Соберите рецепт из вашего каталога ингредиентов.'
      }
      close={close}
    >
      <FormSteps
        onSubmit={async (e) => {
          e.preventDefault();
          const saved =
            isSet && components.length
              ? { ...value, ingredients: [], extraCosts: [] }
              : !isSet && value.components?.length
                ? { ...value, components: [] }
                : value;
          if (
            await run({ type: 'cocktail', value: saved }, 'Позиция сохранена. Прошлые продажи не изменились.')
          ) {
            close();
          }
        }}
        submit={<Submit>{t('Сохранить позицию')}</Submit>}
        steps={[
          {
            title: 'Основное',
            content: (
              <>
                <Field label="Название позиции">
                  <input
                    required
                    maxLength={80}
                    disabled={!!value.stockAlcoholId}
                    value={value.name}
                    placeholder={t('Например, Barbar Sunset')}
                    onChange={(e) => setValue({ ...value, name: e.target.value })}
                  />
                </Field>
                <Field label="Категория меню">
                  <select
                    disabled={!!value.stockAlcoholId}
                    value={value.category || 'cocktail'}
                    onChange={(e) => setValue({ ...value, category: e.target.value as Cocktail['category'] })}
                  >
                    {t(
                      recipeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {t(c.label)}
                        </option>
                      )),
                    )}
                  </select>
                </Field>
                <PhotoPicker
                  value={value}
                  // Choosing a library photo is a choice against the item's own photo.
                  onChange={(image) => setValue((current) => withPhoto({ ...current, image }))}
                  onPhoto={(photo) => setValue((current) => withPhoto(current, photo))}
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
                    {components.map((part, index) => (
                      <div className="ingredient-inputs" key={index}>
                        <select
                          aria-label={t(`Настойка ${index + 1}`)}
                          required
                          value={part.cocktailId}
                          onChange={(e) =>
                            setComponents(
                              components.map((p, i) =>
                                i === index ? { ...p, cocktailId: e.target.value } : p,
                              ),
                            )
                          }
                        >
                          {!part.cocktailId && <option value="">{t('Выберите настойку')}</option>}
                          {tinctures
                            .filter(
                              (c) =>
                                c.id === part.cocktailId || !components.some((p) => p.cocktailId === c.id),
                            )
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {t(c.name)}
                                {c.ingredients.length ? '' : t(' · нет рецепта')}
                              </option>
                            ))}
                        </select>
                        <label>
                          <input
                            aria-label={t(`Шоты настойки ${index + 1}`)}
                            type="number"
                            min="1"
                            max={barConfig.menu.sets.maxShots}
                            step="1"
                            required
                            value={part.quantity || ''}
                            onChange={(e) =>
                              setComponents(
                                components.map((p, i) =>
                                  i === index ? { ...p, quantity: Number(e.target.value) } : p,
                                ),
                              )
                            }
                          />
                          <span>{t('шт.')}</span>
                        </label>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t(`Удалить настойку ${index + 1}`)}
                          onClick={() => setComponents(components.filter((_, i) => i !== index))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-link add-ingredient"
                      disabled={
                        components.length >= Math.min(barConfig.menu.sets.maxComponents, tinctures.length) ||
                        components.some((p) => !p.cocktailId)
                      }
                      onClick={() => setComponents([...components, { cocktailId: '', quantity: 1 }])}
                    >
                      <Plus size={15} />
                      {t(' Добавить настойку')}
                    </button>
                    <p className="form-help">
                      {t('Всего шотов: ')}
                      <strong>{shotsInSet(value)}</strong>
                      {t('. При продаже сета со склада списываются рецепты выбранных настоек.')}
                    </p>
                  </>
                ) : (
                  <>
                    <IngredientRows
                      ingredients={value.ingredients}
                      items={data.alcohol}
                      category={value.category}
                      taken={taken}
                      disabled={!!value.stockAlcoholId}
                      drinkDefault={30}
                      onChange={(ingredients) => setValue({ ...value, ingredients })}
                    />
                    {menuCategoryConfig(value.category)?.extraCosts && (
                      <details className="extra-costs" open={!!value.extraCosts?.length || undefined}>
                        <summary>
                          {t('Дополнительные расходы на порцию')}
                          <ChevronDown size={16} className="photo-picker-chevron" aria-hidden="true" />
                        </summary>
                        <p className="form-help">
                          {t(
                            'Для мелочей, которые не взвешиваются и не ведутся на складе: долька лимона, лёд, трубочка. Укажите примерную стоимость на одну порцию — она войдёт в себестоимость, но со склада ничего не спишется. Если продукт нужно списывать со склада, добавьте его в «Ингредиенты» в граммах или штуках.',
                          )}
                        </p>
                        {t(
                          (value.extraCosts || []).map((expense, index) => (
                            <div className="ingredient-inputs" key={index}>
                              <select
                                aria-label={t(`Продукт по стоимости ${index + 1}`)}
                                value={expense.alcoholId}
                                onChange={(e) =>
                                  setValue({
                                    ...value,
                                    extraCosts: value.extraCosts!.map((x, j) =>
                                      j === index ? { ...x, alcoholId: e.target.value } : x,
                                    ),
                                  })
                                }
                              >
                                {t(
                                  data.alcohol
                                    .filter(
                                      (a) =>
                                        ['mixer', 'food'].includes(a.category) &&
                                        (a.id === expense.alcoholId ||
                                          (!value.ingredients.some((i) => i.alcoholId === a.id) &&
                                            !value.extraCosts?.some((i) => i.alcoholId === a.id))),
                                    )
                                    .map((a) => (
                                      <option value={a.id} key={a.id}>
                                        {t(a.name)}
                                      </option>
                                    )),
                                )}
                              </select>
                              <label>
                                <input
                                  required
                                  type="number"
                                  min="0.01"
                                  max="1000000000"
                                  step="0.01"
                                  aria-label={t(`Стоимость продукта ${index + 1}, ֏`)}
                                  value={expense.cost || ''}
                                  onChange={(e) =>
                                    setValue({
                                      ...value,
                                      extraCosts: value.extraCosts!.map((x, j) =>
                                        j === index ? { ...x, cost: Number(e.target.value) } : x,
                                      ),
                                    })
                                  }
                                />
                                <span>֏</span>
                              </label>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={t(`Удалить продукт по стоимости ${index + 1}`)}
                                onClick={() =>
                                  setValue({
                                    ...value,
                                    extraCosts: value.extraCosts!.filter((_, j) => j !== index),
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )),
                        )}
                        <button
                          type="button"
                          className="text-link add-ingredient"
                          disabled={(value.extraCosts?.length || 0) >= 30}
                          onClick={() => {
                            const product = data.alcohol.find(
                              (a) =>
                                (isFoodMenu(value.category)
                                  ? a.category === 'food'
                                  : a.category === 'mixer') &&
                                !value.ingredients.some((i) => i.alcoholId === a.id) &&
                                !value.extraCosts?.some((i) => i.alcoholId === a.id),
                            );
                            if (product)
                              setValue({
                                ...value,
                                extraCosts: [...(value.extraCosts || []), { alcoholId: product.id, cost: 0 }],
                              });
                          }}
                        >
                          <Plus size={15} />
                          {t(' Добавить расход')}
                        </button>
                      </details>
                    )}
                  </>
                )}
                <Field label="Заметка о рецепте">
                  <input
                    maxLength={1000}
                    value={value.notes || ''}
                    placeholder={t('Укажите выход порции, особенности приготовления…')}
                    onChange={(e) => setValue({ ...value, notes: e.target.value })}
                  />
                </Field>
              </>
            ),
          },
          {
            title: 'Цена',
            content: (
              <>
                <div className="cost-box">
                  <div>
                    <Calculator size={19} />
                    <span>{t('Себестоимость порции')}</span>
                    <strong>{t(money(cost))}</strong>
                  </div>
                  {t(
                    recipeLines.map((i, index) => (
                      <p key={index}>
                        <span>
                          {t(data.alcohol.find((a) => a.id === i.alcoholId)?.name)} ·{t(' ')}
                          {t(ingredientVolume(data, i.alcoholId, i.ml))}
                        </span>
                        <b>
                          {t(
                            money(
                              round(
                                (inventory.averageCost(i.alcoholId) * i.ml) / priceBasis(data, i.alcoholId),
                              ),
                            ),
                          )}
                        </b>
                      </p>
                    )),
                  )}
                  {t(
                    extraLines.map((i) => (
                      <p key={i.alcoholId}>
                        <span>
                          {t(data.alcohol.find((a) => a.id === i.alcoholId)?.name)}
                          {t(' · примерно на порцию')}
                        </span>
                        <b>{t(money(i.cost))}</b>
                      </p>
                    )),
                  )}
                  {t(
                    !ready && (
                      <small className="form-warning">
                        {t(
                          value.noIngredients
                            ? 'Себестоимость не указана — прибыль по этой позиции будет неполной.'
                            : 'У некоторых ингредиентов нет закупочной цены. Укажите её на складе для полного расчёта.',
                        )}
                      </small>
                    ),
                  )}
                </div>
                <div className="form-grid">
                  <Field label="Наценка, %">
                    <input
                      type="number"
                      required
                      min="0"
                      max="10000"
                      step="1"
                      value={markup}
                      onChange={(e) => setMarkup(e.target.value)}
                    />
                  </Field>
                  <Field label="Цена продажи, ֏">
                    <input
                      type="number"
                      min="0"
                      max="1000000000"
                      step="0.01"
                      required
                      value={value.price}
                      placeholder="0"
                      onChange={(e) => setValue({ ...value, price: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                {cocktail && (
                  <Link
                    className="text-link price-history-link"
                    to={`/reports?price=cocktail:${cocktail.id}`}
                    onClick={close}
                  >
                    {t('История цен')}
                  </Link>
                )}
                <button
                  type="button"
                  className="suggestion"
                  disabled={!ready || !cost || !markup}
                  onClick={() => setValue({ ...value, price: suggested })}
                >
                  {t('Применить расчёт: ')}
                  {t(money(suggested))} <span>{t('с округлением до 50 ֏')}</span>
                </button>
                <p className="form-help">
                  {t('Валовая прибыль с порции: ')}
                  <strong>{t(money(value.price - cost))}</strong>
                  {t('. Гарниры и другие расходы учитываются, если вы добавили их в рецепт как ингредиенты.')}
                </p>
              </>
            ),
          },
        ]}
      />
    </Modal>
  );
}

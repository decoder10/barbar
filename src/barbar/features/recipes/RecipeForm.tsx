import { useInventoryCalculations } from '../inventory/use-inventory-calculations';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CocktailArt } from '../catalog/art';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { categories, ingredientUnit, ingredientVolume, priceBasis, round, uid } from '../../domain/model';
import type { Cocktail } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { menuImage, menuPhotos, photoGroups } from '../../domain/catalog/legacy-images';
import { useBar } from '../../app/providers/BarProvider';

export function RecipeForm({ cocktail, close }: { cocktail?: Cocktail; close: () => void }) {
  const { data, run } = useBar();
  const inventory = useInventoryCalculations(data);
  const [value, setValue] = useState<Cocktail>(
    cocktail
      ? JSON.parse(JSON.stringify(cocktail))
      : { id: uid(), name: '', category: 'cocktail', price: 0, ingredients: [], image: 0 },
  );
  const [photoGroup, setPhotoGroup] = useState(() => Math.floor((menuImage(cocktail || value) - 12) / 16));
  const [markup, setMarkup] = useState('200');
  const cost = inventory.recipeCost(value.ingredients, value.extraCosts);
  const ready = inventory.recipeReady(value.ingredients, value.extraCosts);
  const suggested = Math.ceil((cost * (1 + Number(markup) / 100)) / 50) * 50;
  const updateIngredient = (index: number, update: object) =>
    setValue({
      ...value,
      ingredients: value.ingredients.map((ingredient, i) =>
        i === index ? { ...ingredient, ...update } : ingredient,
      ),
    });
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
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ type: 'cocktail', value }, 'Позиция сохранена. Прошлые продажи не изменились.')) {
            close();
          }
        }}
      >
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
              categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(c.label)}
                </option>
              )),
            )}
          </select>
        </Field>
        <div className="field">
          <span>{t('Изображение')}</span>
          <p className="form-help">{t('Фотографии напитков. Выберите форму бокала и пример подачи.')}</p>
          <div className="photo-group-tabs">
            {t(
              photoGroups.map((group, index) => (
                <button
                  type="button"
                  key={group.file}
                  aria-pressed={photoGroup === index}
                  className={photoGroup === index ? 'selected' : ''}
                  onClick={() => setPhotoGroup(index)}
                >
                  {t(group.label)}
                </button>
              )),
            )}
          </div>
          <div className="image-options">
            {t(
              menuPhotos
                .filter((photo) => photo.sheet === photoGroup)
                .map((photo) => (
                  <button
                    type="button"
                    key={photo.id}
                    aria-label={t(`Изображение: ${photo.name}`)}
                    title={t(photo.name)}
                    aria-pressed={menuImage(value) === photo.id}
                    className={menuImage(value) === photo.id ? 'selected' : ''}
                    onClick={() => setValue({ ...value, image: photo.id })}
                  >
                    <CocktailArt image={photo.id} name={photo.name} />
                    <span>{t(photo.name)}</span>
                  </button>
                )),
            )}
          </div>
        </div>
        <div className="ingredient-label">
          <span>{t('Ингредиенты')}</span>
          <small>{t('Количество на одну порцию')}</small>
        </div>
        {t(
          value.ingredients.map((ingredient, index) => (
            <div className="ingredient-inputs" key={index}>
              <select
                aria-label={t(`Ингредиент ${index + 1}`)}
                required
                disabled={!!value.stockAlcoholId}
                value={ingredient.alcoholId}
                onChange={(e) =>
                  updateIngredient(index, {
                    alcoholId: e.target.value,
                    ml: data.alcohol.find((a) => a.id === e.target.value)?.unit === 'bottle' ? 1 : 30,
                  })
                }
              >
                {t(
                  data.alcohol
                    .filter(
                      (a) =>
                        a.id === ingredient.alcoholId ||
                        (!value.ingredients.some((i) => i.alcoholId === a.id) &&
                          !value.extraCosts?.some((i) => i.alcoholId === a.id)),
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
                  aria-label={t(
                    priceBasis(data, ingredient.alcoholId) === 1
                      ? `Бутылки ингредиента ${index + 1}`
                      : `Миллилитры ингредиента ${index + 1}`,
                  )}
                  disabled={!!value.stockAlcoholId}
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={ingredient.ml || ''}
                  required
                  onChange={(e) => updateIngredient(index, { ml: Number(e.target.value) })}
                />
                <span>{t(ingredientUnit(data, ingredient.alcoholId))}</span>
              </label>
              <button
                type="button"
                className="icon-button"

                disabled={!!value.stockAlcoholId}
                aria-label={t(`Удалить ингредиент ${index + 1}`)}
                onClick={() =>
                  setValue({ ...value, ingredients: value.ingredients.filter((_, i) => i !== index) })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          )),
        )}
        <button
          className="text-link add-ingredient"
          type="button"
          disabled={!!value.stockAlcoholId || value.ingredients.length >= Math.min(30, data.alcohol.length)}
          onClick={() => {
            const next = data.alcohol.find(
              (a) =>
                !value.ingredients.some((i) => i.alcoholId === a.id) &&
                !value.extraCosts?.some((i) => i.alcoholId === a.id),
            );
            if (next) {
              setValue({
                ...value,
                ingredients: [
                  ...value.ingredients,
                  { alcoholId: next.id, ml: next.unit === 'bottle' ? 1 : 30 },
                ],
              });
            }
          }}
        >
          <Plus size={15} />
          {t(' Добавить ингредиент')}
        </button>
        <div className="ingredient-label">
          <span>{t('Продукты: стоимость на порцию')}</span>
          <small>{t('Без взвешивания')}</small>
        </div>
        <p className="form-help">
          {t(
            'Например, лимон — 50 ֏, лёд — 20 ֏. Сумма входит в себестоимость каждой порции. Количество продукта со склада не списывается. Для точного остатка добавьте продукт выше в его единицах измерения.',
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
                        a.category === 'mixer' &&
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
                  setValue({ ...value, extraCosts: value.extraCosts!.filter((_, j) => j !== index) })
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
                a.category === 'mixer' &&
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
          {t(' Добавить продукт по стоимости')}
        </button>
        <Field label="Заметка о рецепте">
          <input
            maxLength={1000}
            value={value.notes || ''}
            placeholder={t('Укажите выход порции, особенности приготовления…')}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </Field>
        <div className="cost-box">
          <div>
            <Calculator size={19} />
            <span>{t('Себестоимость порции')}</span>
            <strong>{t(money(cost))}</strong>
          </div>
          {t(
            value.ingredients.map((i, index) => (
              <p key={index}>
                <span>
                  {t(data.alcohol.find((a) => a.id === i.alcoholId)?.name)} ·{t(' ')}
                  {t(ingredientVolume(data, i.alcoholId, i.ml))}
                </span>
                <b>
                  {t(
                    money(round((inventory.averageCost(i.alcoholId) * i.ml) / priceBasis(data, i.alcoholId))),
                  )}
                </b>
              </p>
            )),
          )}
          {t(
            (value.extraCosts || []).map((i) => (
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
                {t('У некоторых ингредиентов нет закупочной цены. Укажите её на складе для полного расчёта.')}
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
        <Submit>{t('Сохранить позицию')}</Submit>
      </form>
    </Modal>
  );
}

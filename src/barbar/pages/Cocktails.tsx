import { useState } from 'react';
import { Calculator, Plus, Search, Trash2 } from 'lucide-react';
import {
  CocktailArt,
  CocktailCard,
  Empty,
  ExportButton,
  Field,
  Modal,
  PageHeading,
  Submit,
} from '../components';
import {
  averageCost,
  categories,
  categoryLabel,
  ingredientUnit,
  ingredientVolume,
  money,
  recipeCost,
  recipeReady,
  round,
  uid,
} from '../model';
import { useSearchParams } from 'react-router-dom';
import { useBar } from '../store';
import { menuImage, menuPhotos, photoGroups } from '../images';
import type { Cocktail } from '../types';

function RecipeForm({ cocktail, close }: { cocktail?: Cocktail; close: () => void }) {
  const { data, run } = useBar();
  const [value, setValue] = useState<Cocktail>(
    cocktail
      ? JSON.parse(JSON.stringify(cocktail))
      : { id: uid(), name: '', category: 'cocktail', price: 0, ingredients: [], image: 0 },
  );
  const [photoGroup, setPhotoGroup] = useState(() => Math.floor((menuImage(cocktail || value) - 12) / 16));
  const [markup, setMarkup] = useState('200');
  const cost = recipeCost(data, value.ingredients, value.extraCosts);
  const ready = recipeReady(data, value.ingredients, value.extraCosts);
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
      title={cocktail ? 'Редактировать позицию' : 'Новая позиция меню'}
      subtitle="Соберите рецепт из вашего каталога ингредиентов."
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
            value={value.name}
            placeholder="Например, Barbar Sunset"
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label="Категория меню">
          <select
            value={value.category || 'cocktail'}
            onChange={(e) => setValue({ ...value, category: e.target.value as Cocktail['category'] })}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span>Изображение</span>
          <p className="form-help">64 иллюстрации. Выберите подходящую форму бокала и подачу.</p>
          <div className="photo-group-tabs">
            {photoGroups.map((group, index) => (
              <button
                type="button"
                key={group.file}
                aria-pressed={photoGroup === index}
                className={photoGroup === index ? 'selected' : ''}
                onClick={() => setPhotoGroup(index)}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="image-options">
            {menuPhotos
              .filter((photo) => photo.sheet === photoGroup)
              .map((photo) => (
                <button
                  type="button"
                  key={photo.id}
                  aria-label={`Изображение: ${photo.name}`}
                  title={photo.name}
                  aria-pressed={menuImage(value) === photo.id}
                  className={menuImage(value) === photo.id ? 'selected' : ''}
                  onClick={() => setValue({ ...value, image: photo.id })}
                >
                  <CocktailArt image={photo.id} name={photo.name} />
                  <span>{photo.name}</span>
                </button>
              ))}
          </div>
        </div>
        <div className="ingredient-label">
          <span>Ингредиенты</span>
          <small>Количество на одну порцию</small>
        </div>
        {value.ingredients.map((ingredient, index) => (
          <div className="ingredient-inputs" key={index}>
            <select
              aria-label={`Ингредиент ${index + 1}`}
              required
              value={ingredient.alcoholId}
              onChange={(e) => updateIngredient(index, { alcoholId: e.target.value })}
            >
              {data.alcohol
                .filter(
                  (a) =>
                    a.id === ingredient.alcoholId ||
                    (!value.ingredients.some((i) => i.alcoholId === a.id) &&
                      !value.extraCosts?.some((i) => i.alcoholId === a.id)),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
            <label>
              <input
                aria-label={`Миллилитры ингредиента ${index + 1}`}
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                value={ingredient.ml || ''}
                required
                onChange={(e) => updateIngredient(index, { ml: Number(e.target.value) })}
              />
              <span>{ingredientUnit(data, ingredient.alcoholId)}</span>
            </label>
            <button
              type="button"
              className="icon-button"

              aria-label={`Удалить ингредиент ${index + 1}`}
              onClick={() =>
                setValue({ ...value, ingredients: value.ingredients.filter((_, i) => i !== index) })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          className="text-link add-ingredient"
          type="button"
          disabled={value.ingredients.length >= Math.min(30, data.alcohol.length)}
          onClick={() => {
            const next = data.alcohol.find(
              (a) =>
                !value.ingredients.some((i) => i.alcoholId === a.id) &&
                !value.extraCosts?.some((i) => i.alcoholId === a.id),
            );
            if (next) {
              setValue({ ...value, ingredients: [...value.ingredients, { alcoholId: next.id, ml: 30 }] });
            }
          }}
        >
          <Plus size={15} /> Добавить ингредиент
        </button>
        <div className="ingredient-label">
          <span>Продукты: стоимость на порцию</span>
          <small>Без взвешивания</small>
        </div>
        <p className="form-help">
          Например, лимон — 50 ֏, лёд — 20 ֏. Сумма входит в себестоимость каждой порции. Количество продукта
          со склада не списывается. Для точного остатка добавьте продукт выше в мл/г.
        </p>
        {(value.extraCosts || []).map((expense, index) => (
          <div className="ingredient-inputs" key={index}>
            <select
              aria-label={`Продукт по стоимости ${index + 1}`}
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
              {data.alcohol
                .filter(
                  (a) =>
                    a.category === 'mixer' &&
                    (a.id === expense.alcoholId ||
                      (!value.ingredients.some((i) => i.alcoholId === a.id) &&
                        !value.extraCosts?.some((i) => i.alcoholId === a.id))),
                )
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
            <label>
              <input
                required
                type="number"
                min="0.01"
                max="1000000000"
                step="0.01"
                aria-label={`Стоимость продукта ${index + 1}, ֏`}
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
              aria-label={`Удалить продукт по стоимости ${index + 1}`}
              onClick={() =>
                setValue({ ...value, extraCosts: value.extraCosts!.filter((_, j) => j !== index) })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
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
          <Plus size={15} /> Добавить продукт по стоимости
        </button>
        <Field label="Заметка о рецепте">
          <input
            maxLength={1000}
            value={value.notes || ''}
            placeholder="Укажите выход порции, особенности приготовления…"
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </Field>
        <div className="cost-box">
          <div>
            <Calculator size={19} />
            <span>Себестоимость порции</span>
            <strong>{money(cost)}</strong>
          </div>
          {value.ingredients.map((i, index) => (
            <p key={index}>
              <span>
                {data.alcohol.find((a) => a.id === i.alcoholId)?.name} ·{' '}
                {ingredientVolume(data, i.alcoholId, i.ml)}
              </span>
              <b>{money(round((averageCost(data, i.alcoholId) * i.ml) / 1000))}</b>
            </p>
          ))}
          {(value.extraCosts || []).map((i) => (
            <p key={i.alcoholId}>
              <span>{data.alcohol.find((a) => a.id === i.alcoholId)?.name} · примерно на порцию</span>
              <b>{money(i.cost)}</b>
            </p>
          ))}
          {!ready && (
            <small className="form-warning">
              У некоторых ингредиентов нет закупочной цены. Укажите её на складе для полного расчёта.
            </small>
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
          Применить расчёт: {money(suggested)} <span>с округлением до 50 ֏</span>
        </button>
        <p className="form-help">
          Валовая прибыль с порции: <strong>{money(value.price - cost)}</strong>. Гарниры и другие расходы
          учитываются, если вы добавили их в рецепт как ингредиенты.
        </p>
        <Submit>Сохранить позицию</Submit>
      </form>
    </Modal>
  );
}
export default function Cocktails() {
  const { data } = useBar();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<Cocktail | 'new' | null>(
    () => data.cocktails.find((c) => c.id === params.get('edit')) || null,
  );
  const [category, setCategory] = useState('cocktail');
  const [visible, setVisible] = useState(24);
  const [search, setSearch] = useState('');
  const items = data.cocktails.filter(
    (c) =>
      (category === 'all' || (c.category || 'cocktail') === category) &&
      c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="ИСКУССТВО В КАЖДОЙ ПОРЦИИ"
        title="Меню и рецепты"
        description="Ваши рецепты, точные пропорции и цены, в которых всё учтено."
      >
        <ExportButton name="cocktails.json" value={data.cocktails} />
        <button className="button primary" onClick={() => setSelected('new')}>
          <Plus size={17} /> Добавить позицию
        </button>
      </PageHeading>
      <div className="recipe-banner">
        <span className="recipe-banner-icon">
          <Calculator size={27} />
        </span>
        <div>
          <h3>Ваше меню уже здесь. Добавим состав?</h3>
          <p>
            Названия и продажные цены перенесены из меню. В редакторе добавьте ингредиенты в мл или граммах —
            себестоимость рассчитается отдельно.
          </p>
        </div>
        <span className="recipe-banner-number">01 / 04</span>
      </div>
      <div className="section-title">
        <div>
          <h2>
            Авторская коллекция <span className="inline-count">{data.cocktails.length}</span>
          </h2>
          <p>Нажмите на коктейль, чтобы открыть рецепт и настроить цену</p>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Поиск коктейля"
            placeholder="Название коктейля…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="menu-categories">
        {[{ id: 'all', label: 'Всё меню' }, ...categories].map((c) => (
          <button
            key={c.id}
            className={category === c.id ? 'active' : ''}
            onClick={() => {
              setCategory(c.id);
              setVisible(24);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="recipe-grid">
        {items.slice(0, visible).map((c) => (
          <div key={c.id}>
            <CocktailCard
              cocktail={c}
              detail={
                [
                  ...c.ingredients.map(
                    (i) =>
                      `${data.alcohol.find((a) => a.id === i.alcoholId)?.name} ${ingredientVolume(data, i.alcoholId, i.ml)}`,
                  ),
                  ...(c.extraCosts || []).map(
                    (i) => `${data.alcohol.find((a) => a.id === i.alcoholId)?.name} ≈ ${money(i.cost)}`,
                  ),
                ].join(' · ') || 'Состав пока не заполнен'
              }
              footer={<span className="edit-recipe">Рецепт ↗</span>}
              action={() => setSelected(c)}
            />
            <div className="recipe-card-meta">
              <span>
                Себестоимость{' '}
                <b>
                  {c.ingredients.length || c.extraCosts?.length
                    ? money(recipeCost(data, c.ingredients, c.extraCosts))
                    : 'Добавьте состав'}
                </b>
              </span>
              <span>
                Категория <b>{categoryLabel(c.category)}</b>
              </span>
            </div>
          </div>
        ))}
        <button className="new-recipe-card" onClick={() => setSelected('new')}>
          <span>
            <Plus size={26} />
          </span>
          <h3>Ваш следующий хит</h3>
          <p>
            Добавьте напиток или блюдо
            <br />в ваше меню
          </p>
        </button>
      </div>
      {items.length > visible && (
        <button className="button secondary load-more" onClick={() => setVisible(visible + 24)}>
          Показать ещё · {items.length - visible}
        </button>
      )}
      {!items.length && search && (
        <Empty title="Коктейль не найден" text="Попробуйте другой запрос или создайте свой рецепт." />
      )}
      <p className="page-footnote">
        Фотографии иллюстративные и выбираются в редакторе. Состав и размеры порций не указаны в бумажном
        меню, поэтому их нужно заполнить перед продажей. «Your cocktail» — цена по договорённости; задайте её
        вручную.
      </p>
      {selected && (
        <RecipeForm cocktail={selected === 'new' ? undefined : selected} close={() => setSelected(null)} />
      )}
    </>
  );
}

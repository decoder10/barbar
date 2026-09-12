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
import type { Cocktail } from '../types';

function RecipeForm({ cocktail, close }: { cocktail?: Cocktail; close: () => void }) {
  const { data, run } = useBar();
  const [value, setValue] = useState<Cocktail>(
    cocktail
      ? JSON.parse(JSON.stringify(cocktail))
      : { id: uid(), name: '', category: 'cocktail', price: 0, ingredients: [], image: 0 },
  );
  const [markup, setMarkup] = useState('200');
  const cost = recipeCost(data, value.ingredients);
  const ready = recipeReady(data, value.ingredients);
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
          <div className="image-options">
            {Array.from({ length: 12 }, (_, i) => i).map((i) => (
              <button
                type="button"
                key={i}
                aria-label={`Стиль коктейля ${i + 1}`}
                aria-pressed={value.image === i}
                className={value.image === i ? 'selected' : ''}
                onClick={() => setValue({ ...value, image: i })}
              >
                <CocktailArt image={i} name={`Вариант ${i + 1}`} />
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
                    a.id === ingredient.alcoholId || !value.ingredients.some((i) => i.alcoholId === a.id),
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
              disabled={value.ingredients.length <= 1}
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
            const next = data.alcohol.find((a) => !value.ingredients.some((i) => i.alcoholId === a.id));
            if (next) {
              setValue({ ...value, ingredients: [...value.ingredients, { alcoholId: next.id, ml: 30 }] });
            }
          }}
        >
          <Plus size={15} /> Добавить ингредиент
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
                c.ingredients
                  .map(
                    (i) =>
                      `${data.alcohol.find((a) => a.id === i.alcoholId)?.name} ${ingredientVolume(data, i.alcoholId, i.ml)}`,
                  )
                  .join(' · ') || 'Состав пока не заполнен'
              }
              footer={<span className="edit-recipe">Рецепт ↗</span>}
              action={() => setSelected(c)}
            />
            <div className="recipe-card-meta">
              <span>
                Себестоимость{' '}
                <b>{c.ingredients.length ? money(recipeCost(data, c.ingredients)) : 'Добавьте состав'}</b>
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

import { useState } from 'react';
import { Plus, Search, TriangleAlert } from 'lucide-react';
import { CocktailArt, Empty, PageHeading } from '../components';
import { categories, categoryLabel, unitLabel } from '../model';
import { menuImage } from '../images';
import { useBar } from '../store';
import StaffCocktailForm from '../StaffCocktailForm';
import type { StaffRecipe } from '../types';

export default function StaffRecipes() {
  const { staffData } = useBar();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(24);
  const [selected, setSelected] = useState<StaffRecipe | 'new' | null>(null);
  if (!staffData) return <p className="muted">Загружаем рецепты…</p>;
  const recipes = staffData.recipes.filter(
    (c) =>
      (category === 'all' || c.category === category) &&
      c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="BARBAR · МЕНЮ"
        title="Меню и рецепты"
        description="Добавляйте ингредиенты, указывайте количество на порцию и способ приготовления."
      >
        <button className="button primary" onClick={() => setSelected('new')}>
          <Plus size={17} />
          Добавить коктейль
        </button>
      </PageHeading>
      <div className="catalog-tools sales-catalog-tools">
        <div className="menu-categories">
          {[{ id: 'all', label: 'Всё меню' }, ...categories].map((c) => (
            <button
              key={c.id}
              className={category === c.id ? 'active' : ''}
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory(c.id);
                setVisible(24);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Поиск рецепта"
            placeholder="Название коктейля…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(24);
            }}
          />
        </label>
      </div>
      <div className="recipe-grid">
        {recipes.slice(0, visible).map((c) => {
          const missing = c.ingredients.filter(
            (i) => (staffData.ingredients.find((a) => a.id === i.alcoholId)?.available || 0) + 1e-7 < i.ml,
          );
          return (
            <button key={c.id} className="drink-card" onClick={() => setSelected(c)}>
              <div className="card-image">
                <CocktailArt image={menuImage(c)} name={c.name} />
                <span className="card-badge">{categoryLabel(c.category)}</span>
              </div>
              <div className="card-content">
                <h3>{c.name}</h3>
                <p>
                  {c.ingredients
                    .map((i) => {
                      const ingredient = staffData.ingredients.find((a) => a.id === i.alcoholId);
                      return `${ingredient?.name || 'Ингредиент'} · ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(i.ml)} ${unitLabel(ingredient?.unit)}`;
                    })
                    .join(' / ') || 'Ингредиенты пока не добавлены'}
                </p>
                {missing.length > 0 && (
                  <p className="staff-recipe-missing">
                    <TriangleAlert size={14} aria-hidden="true" />
                    Не хватает:{' '}
                    {missing
                      .map((i) => staffData.ingredients.find((a) => a.id === i.alcoholId)?.name)
                      .join(', ')}
                  </p>
                )}
                <div className="card-bottom">
                  <span>{c.editable ? 'Редактировать рецепт' : 'Посмотреть состав'}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {recipes.length > visible && (
        <button className="button secondary load-more" onClick={() => setVisible(visible + 24)}>
          Показать ещё · {recipes.length - visible}
        </button>
      )}
      {!recipes.length && <Empty title="Рецепты не найдены" text="Измените поиск или категорию." />}
      {selected && (
        <StaffCocktailForm
          recipe={selected === 'new' ? undefined : selected}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}

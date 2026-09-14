import { Plus, Search, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { CocktailArt } from '../features/catalog/art';
import { Empty, PageHeading } from '../ui/layout';
import { categories, categoryLabel, unitLabel } from '../domain/model';
import type { StaffRecipe } from '../domain/types';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import StaffCocktailForm from '../features/recipes/StaffCocktailForm';
import { locale, t } from '../presentation/i18n/runtime';
import { menuImage } from '../domain/catalog/legacy-images';
import { useBar } from '../app/providers/BarProvider';

export default function StaffRecipes() {
  const { staffData } = useBar();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useCatalogSort('worker-recipes');
  const [visible, setVisible] = useState(24);
  const [selected, setSelected] = useState<StaffRecipe | 'new' | null>(null);
  if (!staffData) return <p className="muted">{t('Загружаем рецепты…')}</p>;
  const recipes = staffData.recipes.filter(
    (c) =>
      (category === 'all' || c.category === category) &&
      c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  recipes.sort((a, b) =>
    compareCatalog(
      { name: a.name, recipeMissing: !a.ingredients.length },
      { name: b.name, recipeMissing: !b.ingredients.length },
      sort,
    ),
  );
  return (
    <>
      <PageHeading
        eyebrow="BARBAR · МЕНЮ"
        title={t('Меню и рецепты')}
        description="Добавляйте ингредиенты, указывайте количество на порцию и способ приготовления."
      >
        <button className="button primary" onClick={() => setSelected('new')}>
          <Plus size={17} />
          {t('Добавить коктейль')}
        </button>
      </PageHeading>
      <div className="catalog-tools sales-catalog-tools">
        <div className="menu-categories">
          {t(
            [{ id: 'all', label: 'Всё меню' }, ...categories].map((c) => (
              <button
                key={c.id}
                className={category === c.id ? 'active' : ''}
                aria-pressed={category === c.id}
                onClick={() => {
                  setCategory(c.id);
                  setVisible(24);
                }}
              >
                {t(c.label)}
              </button>
            )),
          )}
        </div>
        <CatalogSortControl
          storageKey="worker-recipes"
          value={sort}
          onChange={(value) => {
            setSort(value);
            setVisible(24);
          }}
          options={['original', 'recipe', 'name', 'name-desc']}
        />
        <label className="search">
          <Search size={17} />
          <input
            aria-label={t('Поиск рецепта')}
            placeholder={t('Название коктейля…')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(24);
            }}
          />
        </label>
      </div>
      <div className="recipe-grid">
        {t(
          recipes.slice(0, visible).map((c) => {
            const missing = c.ingredients.filter(
              (i) => (staffData.ingredients.find((a) => a.id === i.alcoholId)?.available || 0) + 1e-7 < i.ml,
            );
            return (
              <button key={c.id} className="drink-card" onClick={() => setSelected(c)}>
                <div className="card-image">
                  <CocktailArt image={menuImage(c)} name={c.name} category={c.category} />
                  <span className="card-badge">{t(categoryLabel(c.category))}</span>
                </div>
                <div className="card-content">
                  <h3>{t(c.name)}</h3>
                  <p>
                    {t(
                      c.ingredients
                        .map((i) => {
                          const ingredient = staffData.ingredients.find((a) => a.id === i.alcoholId);
                          return `${ingredient?.name || 'Ингредиент'} · ${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(i.ml)} ${unitLabel(ingredient?.unit)}`;
                        })
                        .join(' / ') || 'Ингредиенты пока не добавлены',
                    )}
                  </p>
                  {t(
                    missing.length > 0 && (
                      <p className="staff-recipe-missing">
                        <TriangleAlert size={14} aria-hidden="true" />
                        {t('Не хватает:')}
                        {t(' ')}
                        {t(
                          missing
                            .map((i) => staffData.ingredients.find((a) => a.id === i.alcoholId)?.name)
                            .join(', '),
                        )}
                      </p>
                    ),
                  )}
                  <div className="card-bottom">
                    <span>{t(c.editable ? 'Редактировать рецепт' : 'Посмотреть состав')}</span>
                  </div>
                </div>
              </button>
            );
          }),
        )}
      </div>
      {t(
        recipes.length > visible && (
          <button className="button secondary load-more" onClick={() => setVisible(visible + 24)}>
            {t('Показать ещё · ')}
            {t(recipes.length - visible)}
          </button>
        ),
      )}
      {t(!recipes.length && <Empty title={t('Рецепты не найдены')} text="Измените поиск или категорию." />)}
      {t(
        selected && (
          <StaffCocktailForm
            recipe={selected === 'new' ? undefined : selected}
            close={() => setSelected(null)}
          />
        ),
      )}
    </>
  );
}

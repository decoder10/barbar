import { AutoReveal } from '../ui/auto-reveal';
import { CategoryTabs } from '../ui/category-tabs';
import { useSessionFilter } from '../presentation/use-session-filter';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { CocktailCard, compositionText } from '../features/catalog/cards';
import { ShortageNote } from '../features/inventory/InventoryProduct';
import { Empty, PageHeading } from '../ui/layout';
import { categoryLabel, ingredientVolume, recipeCategories } from '../domain/model';
import type { StaffRecipe } from '../domain/types';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import StaffCocktailForm from '../features/recipes/StaffCocktailForm';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';

/** Worker recipes: the owner's collection without prices, costs, exports or the guest menu QR. */
export default function StaffRecipes() {
  const { staffData } = useBar();
  const [category, setCategory] = useSessionFilter<string>('category', 'all');
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('worker-recipes');
  const [visible, setVisible] = useState(24);
  const [selected, setSelected] = useState<StaffRecipe | 'new' | null>(null);
  if (!staffData) return <p className="muted">{t('Загружаем рецепты…')}</p>;
  const units = { alcohol: staffData.ingredients };
  const recipeItems = staffData.recipes.filter(
    (c) => c.editable && recipeCategories.some((k) => k.id === c.category),
  );
  const recipes = recipeItems.filter(
    (c) =>
      (category === 'all' || c.category === category) &&
      c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const missing = (c: StaffRecipe) =>
    !c.ingredients.length && !c.noIngredients && !c.components?.length && !c.managedIngredientIds.length;
  recipes.sort((a, b) =>
    compareCatalog(
      { name: a.name, recipeMissing: missing(a) },
      { name: b.name, recipeMissing: missing(b) },
      sort,
    ),
  );
  const name = (id: string) => staffData.ingredients.find((a) => a.id === id)?.name;
  return (
    <>
      <PageHeading
        eyebrow="ИСКУССТВО В КАЖДОЙ ПОРЦИИ"
        title={t('Меню и рецепты')}
        description="Добавляйте ингредиенты, указывайте количество на порцию и способ приготовления."
      >
        <button className="button primary" onClick={() => setSelected('new')}>
          <Plus size={17} />
          {t(' Добавить позицию')}
        </button>
      </PageHeading>
      <div className="section-title">
        <div>
          <h2>
            {t('Авторская коллекция ')}
            <span className="inline-count">{t(recipeItems.length)}</span>
          </h2>
          <p>{t('Нажмите на позицию, чтобы открыть рецепт')}</p>
        </div>
        <CatalogSortControl
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
      <CategoryTabs
        className="menu-categories"
        value={category}
        onChange={setCategory}
        options={[['all', 'Всё меню'] as const, ...recipeCategories.map((c) => [c.id, c.label] as const)]}
      />
      <div className="recipe-grid">
        {recipes.slice(0, visible).map((c) => {
          const short = c.ingredients.filter(
            (i) => (staffData.ingredients.find((a) => a.id === i.alcoholId)?.available || 0) + 1e-7 < i.ml,
          );
          return (
            <div key={c.id}>
              <CocktailCard
                cocktail={{ ...c, price: 0 }}
                hidePrice
                detail={
                  <>
                    <p>
                      {t(
                        compositionText(
                          [
                            ...c.ingredients.map(
                              (i) => `${name(i.alcoholId)} ${ingredientVolume(units, i.alcoholId, i.ml)}`,
                            ),
                            ...c.managedIngredientIds.map(name),
                            ...(c.components || []).map(
                              (p) =>
                                `${staffData.recipes.find((x) => x.id === p.cocktailId)?.name || p.cocktailId} × ${p.quantity}`,
                            ),
                          ],
                          c.noIngredients,
                          'Состав пока не заполнен',
                        ),
                      )}
                    </p>
                    {short.length > 0 && (
                      <ShortageNote>
                        {t('Не хватает:')}
                        {t(' ')}
                        {t(short.map((i) => name(i.alcoholId)).join(', '))}
                      </ShortageNote>
                    )}
                  </>
                }
                footer={<span className="edit-recipe">{t('Рецепт ↗')}</span>}
                action={() => setSelected(c)}
              />
              <div className="recipe-card-meta">
                <span>
                  {t('Категория ')}
                  <b>{t(categoryLabel(c.category))}</b>
                </span>
              </div>
            </div>
          );
        })}
        <button className="new-recipe-card" onClick={() => setSelected('new')}>
          <span>
            <Plus size={26} />
          </span>
          <h3>{t('Ваш следующий хит')}</h3>
          <p>
            {t('Добавьте напиток или блюдо')}
            <br />
            {t('в ваше меню')}
          </p>
        </button>
      </div>
      {recipes.length > visible && (
        <AutoReveal total={recipes.length} visible={visible} setVisible={setVisible} />
      )}
      {!recipes.length && search && (
        <Empty title={t('Коктейль не найден')} text="Попробуйте другой запрос или создайте свой рецепт." />
      )}
      {selected && (
        <StaffCocktailForm
          recipe={selected === 'new' ? undefined : selected}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}

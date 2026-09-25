import { expandExtraCosts, expandRecipe } from '../domain/catalog/sets';
import { AutoReveal } from '../ui/auto-reveal';
import { CategoryTabs } from '../ui/category-tabs';
import { useSessionFilter } from '../presentation/use-session-filter';
import { useInventoryCalculations } from '../features/inventory/use-inventory-calculations';
import { ArrowDownToLine, MoreHorizontal, Plus, QrCode, Search } from 'lucide-react';
import { GuestMenuQrModal } from '../features/guest/GuestMenuQr';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CocktailCard, compositionText } from '../features/catalog/cards';
import { ShortageNote } from '../features/inventory/InventoryProduct';
import { Empty, PageHeading } from '../ui/layout';
import { download, ExportButton } from '../ui/export';
import { FilterSheet, MenuButton } from '../ui/sheet';
import { useCompact } from '../ui/use-compact';
import { formatMoney as money } from '../presentation/currency/format-money';
import { categoryLabel, ingredientVolume, recipeCategories } from '../domain/model';
import type { Cocktail } from '../domain/types';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import { recipeMissing } from '../domain/catalog/recipe-status';
import { byId } from '../domain/lookup';
import { RecipeForm } from '../features/recipes/RecipeForm';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
export default function Cocktails() {
  const { data } = useBar();
  const inventory = useInventoryCalculations(data);
  const compact = useCompact();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<Cocktail | 'new' | null>(
    () => data.cocktails.find((c) => c.id === params.get('edit')) || null,
  );
  const [qr, setQr] = useState(false);
  const [category, setCategory] = useSessionFilter<string>('category', 'cocktail');
  const [visible, setVisible] = useState(24);
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('owner-recipes');
  // Stock-linked bottles, glasses and piece goods are sold from stock and have no recipe to edit.
  const alcoholById = byId(data.alcohol);
  const cocktailById = byId(data.cocktails);
  const recipeItems = data.cocktails.filter(
    (c) => !c.stockAlcoholId && recipeCategories.some((k) => k.id === (c.category || 'cocktail')),
  );
  const items = recipeItems.filter(
    (c) =>
      (category === 'all' || (c.category || 'cocktail') === category) &&
      c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  items.sort((a, b) =>
    compareCatalog(
      { ...a, recipeMissing: recipeMissing({ ...a, managed: a.extraCosts?.length }) },
      { ...b, recipeMissing: recipeMissing({ ...b, managed: b.extraCosts?.length }) },
      sort,
    ),
  );
  const sortControl = (
    <CatalogSortControl
      value={sort}
      onChange={(value) => {
        setSort(value);
        setVisible(24);
      }}
      options={['original', 'recipe', 'name', 'name-desc', 'price', 'price-desc']}
    />
  );
  const searchField = (
    <label className="search">
      <Search size={17} />
      <input
        aria-label={t('Поиск коктейля')}
        placeholder={t('Название коктейля…')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setVisible(24);
        }}
      />
    </label>
  );
  const categoryTabs = (
    <CategoryTabs
      className="menu-categories"
      value={category}
      onChange={setCategory}
      options={[['all', 'Всё меню'] as const, ...recipeCategories.map((c) => [c.id, c.label] as const)]}
    />
  );
  return (
    <>
      <PageHeading
        eyebrow="ИСКУССТВО В КАЖДОЙ ПОРЦИИ"
        title={t('Меню и рецепты')}
        description="Ваши рецепты, точные пропорции и цены, в которых всё учтено."
      >
        {!compact && <ExportButton name="cocktails.json" value={data.cocktails} />}
        {!compact && (
          <button className="button secondary" onClick={() => setQr(true)}>
            <QrCode size={17} />
            {t(' Гостевое меню')}
          </button>
        )}
        <button className="button primary" onClick={() => setSelected('new')}>
          <Plus size={17} />
          {t(' Добавить позицию')}
        </button>
        {compact && (
          <MenuButton
            label="Ещё действия"
            className="button secondary heading-more"
            icon={<MoreHorizontal size={20} />}
            actions={[
              { label: 'Гостевое меню', icon: <QrCode size={19} />, onClick: () => setQr(true) },
              {
                label: 'Скачать JSON',
                icon: <ArrowDownToLine size={19} />,
                onClick: () => download('cocktails.json', data.cocktails),
              },
            ]}
          />
        )}
      </PageHeading>
      {compact ? (
        <div className="catalog-tools">
          <div className="catalog-actions">
            <FilterSheet active={sort !== 'original'}>{sortControl}</FilterSheet>
            {searchField}
          </div>
          {categoryTabs}
        </div>
      ) : (
        <>
          <div className="section-title">
            <div>
              <h2>
                {t('Авторская коллекция ')}
                <span className="inline-count">{t(recipeItems.length)}</span>
              </h2>
              <p>{t('Нажмите на коктейль, чтобы открыть рецепт и настроить цену')}</p>
            </div>
            {sortControl}
            {searchField}
          </div>
          {categoryTabs}
        </>
      )}
      <div className="recipe-grid">
        {t(
          items.slice(0, visible).map((c) => (
            <div key={c.id}>
              <CocktailCard
                cocktail={c}
                detail={
                  <>
                    <p>
                      {t(
                        compositionText(
                          [
                            ...c.ingredients.map(
                              (i) =>
                                `${alcoholById.get(i.alcoholId)?.name} ${ingredientVolume(data, i.alcoholId, i.ml)}`,
                            ),
                            ...(c.extraCosts || []).map(
                              (i) => `${alcoholById.get(i.alcoholId)?.name} ≈ ${money(i.cost)}`,
                            ),
                            ...(c.components || []).map(
                              (p) =>
                                `${cocktailById.get(p.cocktailId)?.name || p.cocktailId} × ${p.quantity}`,
                            ),
                          ],
                          c.noIngredients,
                          'Состав пока не заполнен',
                        ),
                      )}
                    </p>
                    {c.ingredients.some((i) => inventory.stock(i.alcoholId) + 1e-7 < i.ml) && (
                      <ShortageNote>
                        {t('Не хватает:')}
                        {t(' ')}
                        {t(
                          c.ingredients
                            .filter((i) => inventory.stock(i.alcoholId) + 1e-7 < i.ml)
                            .map((i) => alcoholById.get(i.alcoholId)?.name)
                            .join(', '),
                        )}
                      </ShortageNote>
                    )}
                  </>
                }
                footer={<span className="edit-recipe">{t('Рецепт ↗')}</span>}
                action={() => setSelected(c)}
              />
              <div className="recipe-card-meta">
                <span>
                  {t('Себестоимость')}
                  {t(' ')}
                  <b>
                    {t(
                      c.noIngredients
                        ? money(c.portionCost || 0)
                        : c.ingredients.length || c.extraCosts?.length || c.components?.length
                          ? money(
                              inventory.recipeCost(
                                expandRecipe(c, data.cocktails),
                                expandExtraCosts(c, data.cocktails),
                              ),
                            )
                          : 'Добавьте состав',
                    )}
                  </b>
                </span>
                <span>
                  {t('Категория ')}
                  <b>{t(categoryLabel(c.category))}</b>
                </span>
              </div>
            </div>
          )),
        )}
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
      {t(
        items.length > visible && (
          <AutoReveal total={items.length} visible={visible} setVisible={setVisible} />
        ),
      )}
      {t(
        !items.length && search && (
          <Empty title={t('Коктейль не найден')} text="Попробуйте другой запрос или создайте свой рецепт." />
        ),
      )}
      {!compact && (
        <p className="page-footnote">
          {t(
            'Фотографии иллюстративные и выбираются в редакторе. Состав и размеры порций не указаны в бумажном меню, поэтому их нужно заполнить перед продажей. «Your cocktail» — цена по договорённости; задайте её вручную.',
          )}
        </p>
      )}
      {t(
        selected && (
          <RecipeForm cocktail={selected === 'new' ? undefined : selected} close={() => setSelected(null)} />
        ),
      )}
      {qr && <GuestMenuQrModal close={() => setQr(false)} />}
    </>
  );
}

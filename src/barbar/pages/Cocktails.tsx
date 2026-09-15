import { expandExtraCosts, expandRecipe } from '../domain/catalog/sets';
import { AutoReveal } from '../ui/auto-reveal';
import { CategoryTabs } from '../ui/category-tabs';
import { useSessionFilter } from '../presentation/use-session-filter';
import { useInventoryCalculations } from '../features/inventory/use-inventory-calculations';
import { Calculator, Plus, QrCode, Search } from 'lucide-react';
import { GuestMenuQrModal } from '../features/guest/GuestMenuQr';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CocktailCard, compositionText } from '../features/catalog/cards';
import { ShortageNote } from '../features/inventory/InventoryProduct';
import { Empty, PageHeading } from '../ui/layout';
import { ExportButton } from '../ui/export';
import { formatMoney as money } from '../presentation/currency/format-money';
import { categoryLabel, ingredientVolume, recipeCategories } from '../domain/model';
import type { Cocktail } from '../domain/types';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import { RecipeForm } from '../features/recipes/RecipeForm';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
export default function Cocktails() {
  const { data } = useBar();
  const inventory = useInventoryCalculations(data);
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
  const recipeItems = data.cocktails.filter(
    (c) => !c.stockAlcoholId && recipeCategories.some((k) => k.id === (c.category || 'cocktail')),
  );
  const items = recipeItems.filter(
    (c) =>
      (category === 'all' || (c.category || 'cocktail') === category) &&
      c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  items.sort((a, b) =>
    compareCatalog(
      { ...a, recipeMissing: !a.ingredients.length && !a.noIngredients && !a.components?.length },
      { ...b, recipeMissing: !b.ingredients.length && !b.noIngredients && !b.components?.length },
      sort,
    ),
  );
  return (
    <>
      <PageHeading
        eyebrow="ИСКУССТВО В КАЖДОЙ ПОРЦИИ"
        title={t('Меню и рецепты')}
        description="Ваши рецепты, точные пропорции и цены, в которых всё учтено."
      >
        <ExportButton name="cocktails.json" value={data.cocktails} />
        <button className="button secondary" onClick={() => setQr(true)}>
          <QrCode size={17} />
          {t(' Гостевое меню')}
        </button>
        <button className="button primary" onClick={() => setSelected('new')}>
          <Plus size={17} />
          {t(' Добавить позицию')}
        </button>
      </PageHeading>
      <div className="recipe-banner">
        <span className="recipe-banner-icon">
          <Calculator size={27} />
        </span>
        <div>
          <h3>{t('Ваше меню уже здесь. Добавим состав?')}</h3>
          <p>
            {t(
              'Названия и продажные цены перенесены из меню. В редакторе добавьте ингредиенты в мл, граммах или бутылках — себестоимость рассчитается отдельно.',
            )}
          </p>
        </div>
        <span className="recipe-banner-number">01 / 04</span>
      </div>
      <div className="section-title">
        <div>
          <h2>
            {t('Авторская коллекция ')}
            <span className="inline-count">{t(recipeItems.length)}</span>
          </h2>
          <p>{t('Нажмите на коктейль, чтобы открыть рецепт и настроить цену')}</p>
        </div>
        <CatalogSortControl
          value={sort}
          onChange={(value) => {
            setSort(value);
            setVisible(24);
          }}
          options={['original', 'recipe', 'name', 'name-desc', 'price', 'price-desc']}
        />
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
      </div>
      <CategoryTabs
        className="menu-categories"
        value={category}
        onChange={setCategory}
        options={[['all', 'Всё меню'] as const, ...recipeCategories.map((c) => [c.id, c.label] as const)]}
      />
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
                                `${data.alcohol.find((a) => a.id === i.alcoholId)?.name} ${ingredientVolume(data, i.alcoholId, i.ml)}`,
                            ),
                            ...(c.extraCosts || []).map(
                              (i) =>
                                `${data.alcohol.find((a) => a.id === i.alcoholId)?.name} ≈ ${money(i.cost)}`,
                            ),
                            ...(c.components || []).map(
                              (p) =>
                                `${data.cocktails.find((x) => x.id === p.cocktailId)?.name || p.cocktailId} × ${p.quantity}`,
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
                            .map((i) => data.alcohol.find((a) => a.id === i.alcoholId)?.name)
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
      <p className="page-footnote">
        {t(
          'Фотографии иллюстративные и выбираются в редакторе. Состав и размеры порций не указаны в бумажном меню, поэтому их нужно заполнить перед продажей. «Your cocktail» — цена по договорённости; задайте её вручную.',
        )}
      </p>
      {t(
        selected && (
          <RecipeForm cocktail={selected === 'new' ? undefined : selected} close={() => setSelected(null)} />
        ),
      )}
      {qr && <GuestMenuQrModal close={() => setQr(false)} />}
    </>
  );
}

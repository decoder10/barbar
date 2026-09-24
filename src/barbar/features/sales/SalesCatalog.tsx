import { Search } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { cardPage, staffCardPage, type CardPage, type CardQuery } from '../../domain/catalog/cards';
import { favoriteKey, maxFavorites } from '../../domain/favorites';
import { expandRecipe } from '../../domain/catalog/sets';
import { byId } from '../../domain/lookup';
import { categories } from '../../domain/model';
import { popularityWindow } from '../../domain/sales/popularity';
import type { StaffProduct } from '../../domain/types';
import type { CatalogSelection } from './SaleDialog';
import { t } from '../../presentation/i18n/runtime';
import { useSessionFilter } from '../../presentation/use-session-filter';
import { LoadMore } from '../../ui/auto-reveal';
import { CategoryTabs } from '../../ui/category-tabs';
import { Empty } from '../../ui/layout';
import { FilterSheet } from '../../ui/sheet';
import { useCompact } from '../../ui/use-compact';
import { AlcoholCard, CocktailCard, compositionText, stockPill } from '../catalog/cards';
import { FavoriteButtons } from './FavoriteButtons';
import { CatalogSortControl, salesSortDefault, useCatalogSort } from '../catalog/sort';
import { useCardPages } from '../catalog/use-card-pages';
import { useInventoryCalculations } from '../inventory/use-inventory-calculations';

export type { CatalogSelection };

/**
 * The drink catalog of every selling screen, identical for the owner and the worker: category tabs,
 * sort, search and the card grid. The owner's copy renders from the ledger, the worker's from the
 * allowlisted products; the page decides what a tap does.
 */
export function SalesCatalog({
  date,
  filterKey,
  heading = true,
  onSelect,
}: {
  date: string;
  /** Session filter scope: each screen remembers its own category, search and sort. */
  filterKey: string;
  /** The order screen already names the table above the catalog, so it shows no heading. */
  heading?: boolean;
  onSelect: (selection: CatalogSelection) => void;
}) {
  const { data, staffData, role, user, updateFavorites, run, busy, notify } = useBar();
  const compact = useCompact();
  const inventory = useInventoryCalculations(data);
  const worker = role === 'barbar';
  const [category, setCategory] = useSessionFilter<string>(
    `${filterKey}-category`,
    worker ? 'all' : 'cocktail',
  );
  const [search, setSearch] = useSessionFilter<string>(`${filterKey}-search`, '');
  const [sort, setSort] = useCatalogSort(filterKey, salesSortDefault);
  const paged = worker ? !!staffData?.paged : !!data.opening;
  const cocktailById = useMemo(() => byId(data.cocktails), [data.cocktails]);
  const alcoholById = useMemo(() => byId(data.alcohol), [data.alcohol]);
  const products = staffData?.products;
  const productByKey = useMemo(
    () => new Map((products || []).map((p) => [`${p.kind}:${p.id}`, p])),
    [products],
  );
  // Favourites: the user's own (kept in the profile) and the bar's (an owner flag on the item).
  const personal = useMemo(() => new Set(user?.favorites || []), [user?.favorites]);
  const bar = useMemo(
    () =>
      new Set(
        worker
          ? (products || []).filter((p) => p.favorite).map((p) => favoriteKey(p.kind, p.id))
          : [
              ...data.cocktails.filter((c) => c.favorite).map((c) => favoriteKey('cocktail', c.id)),
              ...data.alcohol
                .filter((a) => a.favorite && a.category === 'alcohol')
                .map((a) => favoriteKey('alcohol', a.id)),
            ],
      ),
    [worker, products, data.cocktails, data.alcohol],
  );
  const nameOf = (key: string) => {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    if (worker) return productByKey.get(key)?.name;
    return kind === 'cocktail'
      ? cocktailById.get(id)?.name
      : alcoholById.get(id)?.category === 'alcohol'
        ? alcoholById.get(id)?.name
        : undefined;
  };
  const favoriteList = useMemo(
    () =>
      [...new Set([...personal, ...bar])]
        .map((key) => ({ key, name: nameOf(key) }))
        .filter((item): item is { key: string; name: string } => !!item.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal, bar, worker, productByKey, cocktailById, alcoholById],
  );
  const favoritesPage = (resource: CardQuery['resource'], query: CardQuery): CardPage => {
    const kind = resource === 'cocktails' ? 'cocktail' : 'alcohol';
    const term = query.search.trim().toLocaleLowerCase();
    const rows = favoriteList.filter(
      (item) => item.key.startsWith(`${kind}:`) && item.name.toLocaleLowerCase().includes(term),
    );
    const page = rows.slice(query.offset, query.offset + query.limit);
    return {
      resource,
      ids: page.map((item) => item.key.slice(kind.length + 1)),
      available: {},
      total: rows.length,
      nextOffset: query.offset + page.length < rows.length ? query.offset + page.length : null,
    };
  };
  const favoritesView = category === 'favorites';
  const togglePersonal = (key: string) => {
    const current = (user?.favorites || []).filter((k) => nameOf(k));
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    if (next.length > maxFavorites) return notify(`Можно отметить не больше ${maxFavorites} позиций.`, true);
    void updateFavorites(next);
  };
  const pages = useCardPages({
    resources:
      category === 'alcohol'
        ? ['alcohol']
        : category === 'all' || favoritesView
          ? ['cocktails', 'alcohol']
          : ['cocktails'],
    category,
    search,
    sort,
    date,
    revision: worker ? staffData : data,
    local: favoritesView
      ? { key: `favorites:${favoriteList.map((item) => item.key).join(',')}`, page: favoritesPage }
      : paged
        ? undefined
        : {
            key: date,
            page: (_resource, query) =>
              worker
                ? staffCardPage(
                    staffData?.products || [],
                    query,
                    popularityWindow(staffData?.sales || [], date),
                  )
                : cardPage(data, inventory.quantities, query, popularityWindow(data.sales, date)),
          },
  });
  const recipes = staffData?.recipes;
  const recipeById = useMemo(() => byId(recipes || []), [recipes]);
  const ingredients = staffData?.ingredients;
  const ingredientById = useMemo(() => byId(ingredients || []), [ingredients]);
  const ingredientName = (id: string) => ingredientById.get(id)?.name;
  const sortControl = (
    <CatalogSortControl
      value={sort}
      onChange={setSort}
      options={
        worker
          ? ['original', 'popular', 'available', 'name', 'name-desc']
          : ['original', 'popular', 'available', 'name', 'name-desc', 'price', 'price-desc']
      }
    />
  );
  const workerCard = (p: StaffProduct) => {
    const open = () => onSelect({ kind: p.kind, id: p.id });
    if (p.kind === 'alcohol')
      return (
        <AlcoholCard
          key={`alcohol:${p.id}`}
          drink={{ name: p.name, category: 'alcohol', color: '', pricePerLiter: (p.price || 0) * 1000 }}
          ml={p.available || 0}
          action={open}
          selling
        />
      );
    const recipe = recipeById.get(p.id);
    const lines = recipe ? expandRecipe(recipe, staffData?.recipes || []).length : 0;
    const pill = stockPill({
      portions: p.available,
      lines,
      costLines: recipe?.managedIngredientIds.length || 0,
      noIngredients: recipe?.noIngredients,
    });
    return (
      <CocktailCard
        key={`cocktail:${p.id}`}
        cocktail={{
          name: p.name,
          image: p.image || 0,
          category: p.category === 'alcohol' ? undefined : p.category,
          serving: p.serving,
          price: p.price || 0,
        }}
        detail={compositionText(
          [
            ...(recipe?.ingredients || []).map((i) => ingredientName(i.alcoholId)),
            ...(recipe?.managedIngredientIds || []).map(ingredientName),
            ...(recipe?.components || []).map(
              (c) => `${recipeById.get(c.cocktailId)?.name || c.cocktailId} × ${c.quantity}`,
            ),
          ],
          recipe?.noIngredients,
        )}
        footer={<span className={`stock-pill ${pill.low ? 'low' : ''}`}>{t(pill.label)}</span>}
        action={open}
        unavailable={pill.out}
      />
    );
  };
  const wrap = (kind: 'cocktail' | 'alcohol', id: string, name: string, card: ReactNode) => {
    const key = favoriteKey(kind, id);
    return (
      <div className="card-wrap" key={key}>
        {card}
        <FavoriteButtons
          name={name}
          personal={personal.has(key)}
          bar={bar.has(key)}
          canPinBar={!worker}
          busy={busy}
          onPersonal={() => togglePersonal(key)}
          onBar={() =>
            void run(
              { type: 'setFavorite', kind, productId: id, favorite: !bar.has(key) },
              bar.has(key) ? 'Убрано из избранного заведения.' : 'Добавлено в избранное заведения.',
            )
          }
        />
      </div>
    );
  };
  const cards = pages.items.flatMap(({ resource, id }) => {
    const kind = resource === 'cocktails' ? 'cocktail' : 'alcohol';
    if (worker) {
      const product = productByKey.get(`${kind}:${id}`);
      return product ? [wrap(kind, id, product.name, workerCard(product))] : [];
    }
    const c = kind === 'cocktail' ? cocktailById.get(id) : undefined;
    const a = kind === 'alcohol' ? alcoholById.get(id) : undefined;
    if (c) {
      const lines = expandRecipe(c, data.cocktails);
      const pill = stockPill({
        portions: lines.length ? inventory.portions(lines) : null,
        lines: lines.length,
        costLines: c.extraCosts?.length || 0,
        noIngredients: c.noIngredients,
      });
      return [
        wrap(
          'cocktail',
          c.id,
          c.name,
          <CocktailCard
            key={c.id}
            cocktail={c}
            detail={compositionText(
              [
                ...[...c.ingredients, ...(c.extraCosts || [])].map((i) => alcoholById.get(i.alcoholId)?.name),
                ...(c.components || []).map(
                  (p) => `${cocktailById.get(p.cocktailId)?.name || p.cocktailId} × ${p.quantity}`,
                ),
              ],
              c.noIngredients,
            )}
            footer={<span className={`stock-pill ${pill.low ? 'low' : ''}`}>{t(pill.label)}</span>}
            action={() => onSelect({ kind: 'cocktail', id: c.id })}
            unavailable={pill.out}
          />,
        ),
      ];
    }
    if (a)
      return [
        wrap(
          'alcohol',
          a.id,
          a.name,
          <AlcoholCard
            key={a.id}
            drink={a}
            ml={inventory.stock(a.id)}
            action={() => onSelect({ kind: 'alcohol', id: a.id })}
            selling
          />,
        ),
      ];
    return [];
  });
  return (
    <section className="catalog">
      {heading && (
        <div className="section-title">
          <div>
            <h2>{t('Что наливаем?')}</h2>
            <p>{t('Касание открывает быстрый заказ без стола: несколько позиций и оплата')}</p>
          </div>
        </div>
      )}
      <div className="catalog-tools sales-catalog-tools">
        <CategoryTabs
          className="menu-categories"
          value={category}
          onChange={setCategory}
          options={[
            ['all', 'Всё'] as const,
            ['favorites', 'Избранное'] as const,
            ...categories.map((c) => [c.id, c.label] as const),
            ['alcohol', 'В розлив'] as const,
          ]}
        />
        {compact ? <FilterSheet active={sort !== salesSortDefault}>{sortControl}</FilterSheet> : sortControl}
        <label className="search">
          <Search size={17} />
          <input
            aria-label={t('Поиск напитка')}
            placeholder={t('Найти напиток…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="drink-grid">{cards}</div>
      {pages.error && <p role="alert">{t(pages.error)}</p>}
      {pages.hasMore && <LoadMore remaining={pages.remaining} loading={pages.loading} onMore={pages.more} />}
      {t(
        pages.ready && !cards.length && (
          <Empty
            title={t(favoritesView ? 'Избранного пока нет' : 'Напитки не найдены')}
            text={
              favoritesView
                ? 'Отметьте звёздочкой напитки, которые заказывают чаще всего: они появятся здесь.'
                : 'Попробуйте другое название или измените фильтр.'
            }
          />
        ),
      )}
    </section>
  );
}

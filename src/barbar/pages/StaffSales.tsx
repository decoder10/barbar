import { formatMoney as money } from '../presentation/currency/format-money';
import { LoadingStatus } from '../ui/loading';
import { SalesDayToolbar } from '../features/sales/SalesDayToolbar';
import { LoadMore } from '../ui/auto-reveal';
import { useCardPages } from '../features/catalog/use-card-pages';
import { staffCardPage } from '../domain/catalog/cards';
import { expandRecipe } from '../domain/catalog/sets';
import { useHistory } from '../features/sales/use-history';
import { CategoryTabs } from '../ui/category-tabs';
import { useSessionFilter } from '../presentation/use-session-filter';
import { menuQuantitySummary } from '../domain/quantity-summary';
import { ArrowDownRight, Banknote, GlassWater, Plus, Search, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { AlcoholCard, CocktailCard, compositionText, stockPill } from '../features/catalog/cards';
import { Empty, Metric } from '../ui/layout';
import { businessDayHint } from '../domain/business-day';
import { businessDayLabel } from '../presentation/format-date';
import { dayTotals } from '../domain/sales/day-totals';
import { popularityWindow } from '../domain/sales/popularity';
import { categories, ingredientVolume, round, saleUnit, volume } from '../domain/model';
import { isGlassServing } from '../domain/serving';
import type { StaffProduct } from '../domain/types';
import { CatalogSortControl, salesSortDefault, useCatalogSort } from '../features/catalog/sort';
import StaffCocktailForm from '../features/recipes/StaffCocktailForm';
import { SaleDialog, saleQuantityLabel } from '../features/sales/SaleDialog';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';
import { DayReceipt } from '../features/sales/DayReceipt';
import { FilterSheet } from '../ui/sheet';
import { useCompact } from '../ui/use-compact';

/** Worker sales: the owner's screen without costs, profit, voids, exports or the operation log. */
export default function StaffSales() {
  const { staffData, run } = useBar();
  const [creating, setCreating] = useState(false);
  const compact = useCompact();
  const [date, setDate, currentShift] = useBusinessDate();
  const [category, setCategory] = useSessionFilter<string>('category', 'all');
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('worker-sales', salesSortDefault);
  const [selected, setSelected] = useState<StaffProduct | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [glassMl, setGlassMl] = useState('150');
  const history = useHistory<import('../domain/types').StaffSale>('sales', date);
  const pages = useCardPages({
    resources:
      category === 'alcohol' ? ['alcohol'] : category === 'all' ? ['cocktails', 'alcohol'] : ['cocktails'],
    category,
    search,
    sort,
    date,
    revision: staffData,
    local: staffData?.paged
      ? undefined
      : {
          key: date,
          page: (_resource, query) =>
            staffCardPage(staffData?.products || [], query, popularityWindow(staffData?.sales || [], date)),
        },
  });
  if (!staffData) return <p className="muted">{t('Загружаем продажи…')}</p>;
  const day = history.enabled ? history.rows : staffData.sales.filter((sale) => sale.date === date);
  const sales = history.enabled ? history.groups : day.filter((sale) => !sale.voided);
  const { revenue, menuQuantity, pouredMl: ml, operations: operationCount } = dayTotals(sales);
  // Workers see what was sold, grouped by position, not each operation.
  const summary = new Map<
    string,
    {
      productId: string;
      name: string;
      kind: StaffProduct['kind'];
      unit?: StaffProduct['unit'];
      category?: import('../domain/types').MenuCategory;
      quantity: number;
      revenue: number;
      servingMl?: number;
    }
  >();
  for (const sale of sales) {
    const key = `${sale.kind}:${sale.productId}:${sale.unit || saleUnit(sale)}:${sale.servingMl || ''}`;
    const item = summary.get(key) || {
      productId: sale.productId,
      name: sale.name,
      kind: sale.kind,
      unit: sale.unit,
      category: sale.category,
      quantity: 0,
      revenue: 0,
      servingMl: sale.servingMl,
    };
    item.quantity += sale.quantity;
    item.revenue += sale.revenue || 0;
    summary.set(key, item);
  }
  const dayLabel = businessDayLabel(date);
  const productByKey = new Map(staffData.products.map((p) => [`${p.kind}:${p.id}`, p]));
  const recipeById = new Map(staffData.recipes.map((r) => [r.id, r]));
  const ingredientName = (id: string) => staffData.ingredients.find((a) => a.id === id)?.name;
  const products = pages.items
    .map(({ resource, id }) => productByKey.get(`${resource === 'cocktails' ? 'cocktail' : 'alcohol'}:${id}`))
    .filter((p): p is StaffProduct => !!p);
  const label = (n: number, item: { kind: string; unit?: StaffProduct['unit']; category?: string }) =>
    `${n} ${saleUnit({ ...item, category: item.category === 'alcohol' ? undefined : (item.category as import('../domain/types').MenuCategory) })}`;
  // Availability can change while the form is open on another device.
  const current =
    selected && staffData.products.find((p) => p.id === selected.id && p.kind === selected.kind);
  const amount = Number(quantity);
  const servingMl = Number(glassMl);
  const glassServing = !!current && isGlassServing(current);
  const variableGlass = current?.unit === 'glass' && !!current.glassSizeMl && !!current.bottleSizeMl;
  const available =
    variableGlass && current?.availableMl !== undefined
      ? Math.floor((current.availableMl + 1e-6) / servingMl)
      : current?.available;
  const totalPrice = (current?.price || 0) * amount * (variableGlass ? servingMl / current.glassSizeMl! : 1);
  const currentRecipe = current?.kind === 'cocktail' ? recipeById.get(current.id) : undefined;
  const deducted =
    variableGlass && current?.stockAlcoholId
      ? [{ alcoholId: current.stockAlcoholId, ml: servingMl / current.bottleSizeMl! }]
      : currentRecipe
        ? expandRecipe(currentRecipe, staffData.recipes)
        : current
          ? [{ alcoholId: current.id, ml: 1 }]
          : [];
  const metrics = (
    <section className="metrics">
      <Metric
        label="Выручка за день"
        value={money(revenue)}
        hint={dayLabel}
        icon={<Banknote size={18} />}
        accent
      />
      <Metric
        label="Продано из меню"
        value={`${menuQuantity} ед.`}
        hint={menuQuantitySummary(sales)}
        icon={<GlassWater size={18} />}
      />
      <Metric
        label="Алкоголь в розлив"
        value={volume(ml)}
        hint="Продажи без коктейлей"
        icon={<ArrowDownRight size={18} />}
      />
    </section>
  );
  const sortControl = (
    <CatalogSortControl
      value={sort}
      onChange={(value) => {
        setSort(value);
      }}
      options={['original', 'popular', 'available', 'name', 'name-desc']}
    />
  );
  return (
    <>
      <h1 className="visually-hidden">{t('Продажи за день')}</h1>
      <SalesDayToolbar
        date={date}
        onChange={setDate}
        action={
          <button className="button secondary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            {t('Коктейль')}
          </button>
        }
      />
      <p className="business-day-hint">{t(businessDayHint)}</p>
      {!compact && metrics}
      {t(
        staffData.archivedBefore && date < staffData.archivedBefore && (
          <p className="form-warning">{t('История за этот день очищена владельцем.')}</p>
        ),
      )}
      <div className="sales-layout">
        <section className="catalog">
          <div className="section-title">
            <div>
              <h2>{t('Что наливаем?')}</h2>
              <p>{t('Выберите напиток, чтобы записать продажу')}</p>
            </div>
          </div>
          <div className="catalog-tools sales-catalog-tools">
            <CategoryTabs
              className="menu-categories"
              value={category}
              onChange={setCategory}
              options={[
                ['all', 'Всё'] as const,
                ...categories.map((c) => [c.id, c.label] as const),
                ['alcohol', 'В розлив'] as const,
              ]}
            />
            {compact ? (
              <FilterSheet active={sort !== salesSortDefault}>{sortControl}</FilterSheet>
            ) : (
              sortControl
            )}
            <label className="search">
              <Search size={17} />
              <input
                aria-label={t('Поиск напитка')}
                placeholder={t('Найти напиток…')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
              />
            </label>
          </div>
          <div className="drink-grid">
            {products.map((p) => {
              const open = () => {
                setSelected(p);
                setQuantity(p.kind === 'cocktail' ? '1' : '50');
                setGlassMl(String(p.glassSizeMl || 150));
              };
              if (p.kind === 'alcohol')
                return (
                  <AlcoholCard
                    key={`alcohol:${p.id}`}
                    drink={{
                      name: p.name,
                      category: 'alcohol',
                      color: '',
                      pricePerLiter: (p.price || 0) * 1000,
                    }}
                    ml={p.available || 0}
                    action={open}
                  />
                );
              const recipe = recipeById.get(p.id);
              const lines = recipe ? expandRecipe(recipe, staffData.recipes).length : 0;
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
                />
              );
            })}
          </div>
          {pages.error && <p role="alert">{t(pages.error)}</p>}
          {pages.hasMore && (
            <LoadMore remaining={pages.remaining} loading={pages.loading} onMore={pages.more} />
          )}
          {t(
            pages.ready && !products.length && (
              <Empty title={t('Напитки не найдены')} text="Попробуйте другое название или измените фильтр." />
            ),
          )}
        </section>
        <DayReceipt
          label="Сводка продаж за день"
          dayLabel={dayLabel}
          count={summary.size}
          total={money(revenue)}
          metrics={metrics}
        >
          <div className="receipt-lines">
            {history.loading ? (
              <LoadingStatus />
            ) : history.error ? (
              <p role="alert">{t(history.error)}</p>
            ) : !summary.size ? (
              <Empty
                title={t('День только начинается')}
                text="Добавьте первую продажу — она появится здесь."
              />
            ) : (
              [...summary.entries()].map(([key, item]) => (
                <div className="receipt-line" key={key}>
                  <span className="receipt-drink">
                    <GlassWater size={18} />
                  </span>
                  <div>
                    <strong>{t(item.name)}</strong>
                    <small>
                      {t(label(item.quantity, item))}
                      {t(item.servingMl ? ` · по ${item.servingMl} мл` : '')}
                    </small>
                  </div>
                  <b>{t(money(item.revenue))}</b>
                </div>
              ))
            )}
          </div>
          <div className="receipt-total">
            <span>
              {t('Итого за день')}
              <strong>{t(money(revenue))}</strong>
            </span>
            <small>
              <ShoppingBag size={14} /> {t(operationCount)}
              {t(' операций · ')}
              {t(menuQuantitySummary(sales))}
              {ml > 0 ? ` · ${volume(ml)}` : ''}
            </small>
          </div>
          <div className="receipt-note">
            <span />
            {t(' Остатки списываются автоматически')}
          </div>
          <div className="receipt-note">{t('Для исправления продажи обратитесь к владельцу.')}</div>
        </DayReceipt>
      </div>
      {t(creating && <StaffCocktailForm close={() => setCreating(false)} />)}
      {selected && current && (
        <SaleDialog
          title={selected.name}
          date={date}
          close={() => setSelected(null)}
          kind={selected.kind}
          quantity={quantity}
          setQuantity={setQuantity}
          quantityLabel={saleQuantityLabel(selected.kind, selected.unit)}
          quantityHint={
            available === null || available === undefined
              ? 'Продукты учитываются по стоимости, без контроля количества'
              : `Сейчас доступно: ${current.kind === 'cocktail' ? label(available, current) : volume(available)}`
          }
          glass={
            glassServing
              ? {
                  value: glassMl,
                  onChange: setGlassMl,
                  max: current.bottleSizeMl,
                  hint: `Стоимость пропорциональна объёму. Спишется: ${Math.round((servingMl || 0) * (amount || 0))} мл.`,
                  setup: !variableGlass && (
                    <p className="form-warning">
                      {t('Попросите владельца указать объём бутылки и стандартного бокала на складе.')}
                    </p>
                  ),
                }
              : undefined
          }
          deducted={deducted.map((i) => ({
            id: i.alcoholId,
            name: ingredientName(i.alcoholId),
            amount: ingredientVolume(
              { alcohol: staffData.ingredients },
              i.alcoholId,
              round(i.ml * (amount || 0)),
            ),
          }))}
          noIngredients={currentRecipe?.noIngredients}
          total={totalPrice}
          notices={
            <>
              {!current.ready && (
                <p className="form-warning">{t('Попросите владельца настроить эту позицию.')}</p>
              )}
              {available !== null && available !== undefined && available < amount && (
                <p className="form-warning">{t('Недостаточно ингредиентов на складе.')}</p>
              )}
            </>
          }
          disabled={
            !current.ready ||
            amount <= 0 ||
            !Number.isFinite(amount) ||
            (available !== null && available !== undefined && available < amount) ||
            (variableGlass &&
              (!Number.isInteger(servingMl) || servingMl <= 0 || servingMl > (current.bottleSizeMl || 0))) ||
            (current.kind === 'cocktail' && !Number.isInteger(amount)) ||
            (!!staffData.archivedBefore && date < staffData.archivedBefore)
          }
          submit={async () => {
            if (
              await run(
                {
                  type: 'sale',
                  value: {
                    kind: selected.kind,
                    productId: selected.id,
                    quantity: amount,
                    date,
                    businessDay: currentShift,
                    ...(variableGlass ? { servingMl } : {}),
                  },
                },
                'Продажа записана.',
              )
            )
              setSelected(null);
          }}
        />
      )}
    </>
  );
}

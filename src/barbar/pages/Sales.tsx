import { SalesDayToolbar } from '../features/sales/SalesDayToolbar';
import { LoadMore } from '../ui/auto-reveal';
import { useCardPages } from '../features/catalog/use-card-pages';
import { cardPage } from '../domain/catalog/cards';
import { BusyButton } from '../ui/loading';
import { useHistory } from '../features/sales/use-history';
import { Pagination } from '../ui/pagination';
import { CategoryTabs } from '../ui/category-tabs';
import { useSessionFilter } from '../presentation/use-session-filter';
import { menuQuantitySummary } from '../domain/quantity-summary';
import { useInventoryCalculations } from '../features/inventory/use-inventory-calculations';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  GlassWater,
  Plus,
  Search,
  ShoppingBag,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlcoholCard, CocktailCard, compositionText, stockPill } from '../features/catalog/cards';
import { Empty, Metric } from '../ui/layout';
import { ExportButton } from '../ui/export';
import { Modal } from '../ui/modal';
import { formatMoney as money } from '../presentation/currency/format-money';
import { barConfig } from '../config';
import { businessDayHint, businessDaysBefore } from '../domain/business-day';
import { activeSales, categories, round, saleUnit, volume } from '../domain/model';
import { expandRecipe } from '../domain/catalog/sets';
import type { Alcohol, Cocktail, Sale } from '../domain/types';
import { CatalogSortControl, salesSortDefault, useCatalogSort } from '../features/catalog/sort';
import { SaleForm } from '../features/sales/SaleForm';
import { locale, t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';
import { DayReceipt } from '../features/sales/DayReceipt';
import { FilterSheet } from '../ui/sheet';
import { useCompact } from '../ui/use-compact';
export default function Sales() {
  const { data, run, busy } = useBar();
  const inventory = useInventoryCalculations(data);
  const compact = useCompact();
  const [date, setDate, currentShift] = useBusinessDate();
  const [category, setCategory] = useSessionFilter<string>('category', 'cocktail');
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('owner-sales', salesSortDefault);
  const [selected, setSelected] = useState<{ kind: Sale['kind']; product: Alcohol | Cocktail } | null>(null);
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const history = useHistory('sales', date);
  const allDaySales = history.enabled ? history.rows : data.sales.filter((s) => s.date === date);
  const sales = allDaySales.filter((s) => !s.voided);
  const totals = history.enabled ? history.groups : activeSales(data).filter((s) => s.date === date);
  const operationCount = history.enabled
    ? history.groups.reduce((n, g) => n + g.operations, 0)
    : sales.length;
  const revenue = round(totals.reduce((n, s) => n + (s.revenue || 0), 0));
  const cost = round(totals.reduce((n, s) => n + (s.cost || 0), 0));
  const count = totals.filter((s) => s.kind === 'cocktail').reduce((n, s) => n + s.quantity, 0);
  const ml = totals.filter((s) => s.kind === 'alcohol').reduce((n, s) => n + s.quantity, 0);
  // The default order counts the sales window ending on the chosen day, not that day alone.
  const popularityFrom = businessDaysBefore(date, barConfig.presets.popularityDays - 1);
  const popularity = new Map<string, number>();
  if (!data.opening)
    for (const s of activeSales(data))
      if (s.date >= popularityFrom && s.date <= date) {
        const key = `${s.kind}:${s.productId}`;
        popularity.set(key, (popularity.get(key) || 0) + 1);
      }
  // Card order and search come from server pages; a complete in-memory ledger pages locally.
  const pages = useCardPages({
    resources:
      category === 'alcohol' ? ['alcohol'] : category === 'all' ? ['cocktails', 'alcohol'] : ['cocktails'],
    category,
    search,
    sort,
    date,
    revision: data,
    local: data.opening
      ? undefined
      : {
          // Stable key: the ledger object and the day's popularity, not a new array per render.
          key: JSON.stringify([...popularity]),
          page: (_resource, query) => cardPage(data, inventory.quantities, query, popularity),
        },
  });
  const cocktailById = new Map(data.cocktails.map((c) => [c.id, c]));
  const alcoholById = new Map(data.alcohol.map((a) => [a.id, a]));
  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
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
        label="Валовая прибыль"
        value={money(revenue - cost)}
        hint="Выручка − стоимость ингредиентов"
        icon={<ArrowUpRight size={18} />}
      />
      <Metric
        label="Продано из меню"
        value={`${count} ед.`}
        hint={menuQuantitySummary(totals)}
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
      options={['original', 'popular', 'available', 'name', 'name-desc', 'price', 'price-desc']}
    />
  );
  return (
    <>
      <h1 className="visually-hidden">{t('Продажи за день')}</h1>
      <SalesDayToolbar
        date={date}
        onChange={setDate}
        action={
          <Link className="button secondary" to="/cocktails">
            <Plus size={15} />
            {t(' Коктейль')}
          </Link>
        }
      />
      <p className="business-day-hint">{t(businessDayHint)}</p>
      {!compact && metrics}
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
            {pages.items.map(({ resource, id }) => {
              const c = resource === 'cocktails' ? cocktailById.get(id) : undefined;
              const a = resource === 'alcohol' ? alcoholById.get(id) : undefined;
              if (c) {
                const lines = expandRecipe(c, data.cocktails);
                const pill = stockPill({
                  portions: lines.length ? inventory.portions(lines) : null,
                  lines: lines.length,
                  costLines: c.extraCosts?.length || 0,
                  noIngredients: c.noIngredients,
                });
                return (
                  <CocktailCard
                    key={c.id}
                    cocktail={c}
                    detail={compositionText(
                      [
                        ...[...c.ingredients, ...(c.extraCosts || [])].map(
                          (i) => alcoholById.get(i.alcoholId)?.name,
                        ),
                        ...(c.components || []).map(
                          (p) => `${cocktailById.get(p.cocktailId)?.name || p.cocktailId} × ${p.quantity}`,
                        ),
                      ],
                      c.noIngredients,
                    )}
                    footer={<span className={`stock-pill ${pill.low ? 'low' : ''}`}>{t(pill.label)}</span>}
                    action={() => setSelected({ kind: 'cocktail', product: c })}
                  />
                );
              }
              if (a)
                return (
                  <AlcoholCard
                    key={a.id}
                    drink={a}
                    ml={inventory.stock(a.id)}
                    action={() => setSelected({ kind: 'alcohol', product: a })}
                  />
                );
              return null;
            })}
          </div>
          {pages.error && <p role="alert">{t(pages.error)}</p>}
          {pages.hasMore && (
            <LoadMore remaining={pages.remaining} loading={pages.loading} onMore={pages.more} />
          )}
          {t(
            pages.ready && !pages.items.length && (
              <Empty title={t('Напитки не найдены')} text="Попробуйте другое название или измените фильтр." />
            ),
          )}
        </section>
        <DayReceipt dayLabel={dayLabel} count={operationCount} total={money(revenue)} metrics={metrics}>
          <div className="receipt-lines">
            {t(
              !allDaySales.length ? (
                <Empty
                  title={t('День только начинается')}
                  text="Добавьте первую продажу — она появится здесь."
                />
              ) : (
                (history.enabled ? allDaySales : [...allDaySales].reverse()).map((s) => (
                  <div className={`receipt-line ${s.voided ? 'voided' : ''}`} key={s.id}>
                    <span className="receipt-drink">
                      <GlassWater size={18} />
                    </span>
                    <div>
                      <strong>{t(s.name)}</strong>
                      <small>
                        {t(s.quantity)} {t(saleUnit(s))}
                        {t(s.servingMl ? ` · по ${s.servingMl} мл` : '')}
                        {t(s.voided ? ' · отменена' : '')}
                      </small>
                    </div>
                    <b>{t(money(s.revenue))}</b>
                    {t(
                      !s.voided && (
                        <button
                          className="icon-button"
                          disabled={busy}
                          onClick={() => setVoiding(s)}
                          aria-label={t(`Отменить продажу ${s.name}`)}
                        >
                          <Undo2 size={14} />
                        </button>
                      ),
                    )}
                  </div>
                ))
              ),
            )}
          </div>
          <Pagination page={history} />
          <div className="receipt-total">
            <span>
              {t('Итого за день')}
              <strong>{t(money(revenue))}</strong>
            </span>
            <small>
              <ShoppingBag size={14} /> {t(operationCount)}
              {t(' операций · ')}
              {t(menuQuantitySummary(totals))}
              {ml > 0 ? ` · ${volume(ml)}` : ''}
            </small>
          </div>
          <ExportButton name={`sales-${date}.json`} value={allDaySales}>
            {t(history.enabled ? 'Скачать страницу' : 'Скачать день')}
          </ExportButton>
          <div className="receipt-note">
            <span />
            {t(' Остатки списываются автоматически')}
          </div>
        </DayReceipt>
      </div>
      {t(
        selected && (
          <SaleForm {...selected} date={date} currentShift={currentShift} close={() => setSelected(null)} />
        ),
      )}
      {t(
        voiding && (
          <Modal
            title={t('Отменить продажу?')}
            subtitle={`${voiding.name} · ${money(voiding.revenue)}`}
            close={() => setVoiding(null)}
          >
            <p className="modal-text">
              {t(
                'Ингредиенты вернутся на склад. Запись останется в истории с отметкой об отмене и не будет учитываться в выручке.',
              )}
            </p>
            <BusyButton
              busy={busy}
              className="button primary full"
              disabled={busy}
              onClick={async () => {
                if (
                  await run({ type: 'void', saleId: voiding.id }, 'Продажа отменена. Ингредиенты возвращены.')
                ) {
                  setVoiding(null);
                }
              }}
            >
              {t('Подтвердить отмену')}
            </BusyButton>
          </Modal>
        ),
      )}
    </>
  );
}

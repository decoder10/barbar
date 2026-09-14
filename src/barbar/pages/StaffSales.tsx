import { formatMoney as money } from '../presentation/currency/format-money';
import { LoadingStatus } from '../ui/loading';
import { SalesDayToolbar } from '../features/sales/SalesDayToolbar';
import { AutoReveal } from '../ui/auto-reveal';
import { useHistory } from '../features/sales/use-history';
import { useSessionFilter } from '../presentation/use-session-filter';
import { CheckCircle2, GlassWater, Plus, ReceiptText, Search, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { BottleArt, CocktailArt } from '../features/catalog/art';
import { CatalogCard } from '../features/catalog/cards';
import { Empty, Metric } from '../ui/layout';
import { Field, GlassVolumeField } from '../ui/fields';
import { Modal, Submit } from '../ui/modal';
import { businessDayHint } from '../domain/business-day';
import { categories, categoryLabel, saleUnit, volume } from '../domain/model';
import { isGlassServing } from '../domain/serving';
import type { StaffProduct } from '../domain/types';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import StaffCocktailForm from '../features/recipes/StaffCocktailForm';
import { locale, t } from '../presentation/i18n/runtime';
import { menuImage } from '../domain/catalog/legacy-images';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';

export default function StaffSales() {
  const { staffData, run } = useBar();
  const [creating, setCreating] = useState(false);
  const [date, setDate, currentShift] = useBusinessDate();
  const [category, setCategory] = useSessionFilter<string>('category', 'all');
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('worker-sales');
  const [visible, setVisible] = useState(24);
  const [selected, setSelected] = useState<StaffProduct | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [glassMl, setGlassMl] = useState('150');
  const history = useHistory<import('../domain/types').StaffSale>('sales', date);
  if (!staffData) return <p className="muted">{t('Загружаем продажи…')}</p>;
  const day = history.enabled ? history.rows : staffData.sales.filter((sale) => sale.date === date);
  const sales = history.enabled ? history.groups : day.filter((sale) => !sale.voided);
  const revenue = sales.reduce((sum, sale) => sum + (sale.revenue || 0), 0);
  const operationCount = history.enabled
    ? history.groups.reduce((n, g) => n + g.operations, 0)
    : sales.length;
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
  const prettyDate = new Intl.DateTimeFormat(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
  const totalUnits = new Map<string, number>();
  for (const sale of sales) {
    const unit = saleUnit(sale);
    totalUnits.set(unit, (totalUnits.get(unit) || 0) + sale.quantity);
  }
  const count = sales.filter((s) => s.kind === 'cocktail').reduce((n, s) => n + s.quantity, 0);
  const ml = sales.filter((s) => s.kind === 'alcohol').reduce((n, s) => n + s.quantity, 0);
  const products = staffData.products.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const popularity = new Map<string, number>();
  sales.forEach((s) =>
    popularity.set(
      `${s.kind}:${s.productId}`,
      (popularity.get(`${s.kind}:${s.productId}`) || 0) + ('operations' in s ? s.operations : 1),
    ),
  );
  products.sort((a, b) =>
    compareCatalog(
      {
        name: a.name,
        available: a.ready ? (a.available ?? Infinity) : 0,
        popularity: popularity.get(`${a.kind}:${a.id}`),
      },
      {
        name: b.name,
        available: b.ready ? (b.available ?? Infinity) : 0,
        popularity: popularity.get(`${b.kind}:${b.id}`),
      },
      sort,
    ),
  );
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
      <section className="metrics staff-metrics">
        <Metric
          label="Продано из меню"
          value={`${count} шт.`}
          hint="Бутылки, бокалы и порции за день"
          icon={<GlassWater size={18} />}
          accent
        />
        <Metric
          label="Алкоголь в розлив"
          value={volume(ml)}
          hint="За выбранный день"
          icon={<ShoppingBag size={18} />}
        />
      </section>
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
            <div className="menu-categories">
              {t(
                [['all', 'Всё'], ...categories.map((c) => [c.id, c.label]), ['alcohol', 'В розлив']].map(
                  ([key, name]) => (
                    <button
                      key={key}
                      aria-pressed={category === key}
                      className={category === key ? 'active' : ''}
                      onClick={() => {
                        setCategory(key);
                        setVisible(24);
                      }}
                    >
                      {t(name)}
                    </button>
                  ),
                ),
              )}
            </div>
            <CatalogSortControl
              value={sort}
              onChange={(value) => {
                setSort(value);
                setVisible(24);
              }}
              options={['original', 'popular', 'available', 'name', 'name-desc']}
            />
            <label className="search">
              <Search size={17} />
              <input
                aria-label={t('Поиск напитка')}
                placeholder={t('Найти напиток…')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisible(24);
                }}
              />
            </label>
          </div>
          <div className="drink-grid">
            {t(
              products.slice(0, visible).map((p) => (
                <CatalogCard
                  key={`${p.kind}:${p.id}`}
                  name={p.name}
                  action={() => {
                    setSelected(p);
                    setQuantity(p.kind === 'cocktail' ? '1' : '50');
                    setGlassMl(String(p.glassSizeMl || 150));
                  }}
                  art={
                    p.kind === 'alcohol' ? (
                      <BottleArt drink={{ name: p.name, category: 'alcohol', color: '' }} />
                    ) : (
                      <CocktailArt
                        image={menuImage({
                          name: p.name,
                          image: p.image || 0,
                          category: p.category === 'alcohol' ? undefined : p.category,
                        })}
                        name={p.name}
                        category={p.category}
                        serving={p.unit}
                      />
                    )
                  }
                  badge={
                    p.category === 'alcohol' ? 'В РОЗЛИВ' : categoryLabel(p.category).toLocaleUpperCase()
                  }
                  detail={
                    !p.ready
                      ? 'Попросите владельца настроить позицию'
                      : p.available === null
                        ? 'Доступно к продаже'
                        : `Доступно: ${label(p.available, p)}`
                  }
                  footer={
                    <>
                      <strong>
                        {t(p.price ? money(p.price * (p.kind === 'alcohol' ? 50 : 1)) : 'Цена не задана')}
                      </strong>
                      <span className={`stock-pill ${p.ready && p.available !== 0 ? '' : 'low'}`}>
                        {t(p.ready && p.available !== 0 ? 'Записать продажу' : 'Недоступно')}
                      </span>
                      {p.kind === 'alcohol' && <small>{t('за 50 мл')}</small>}
                    </>
                  }
                />
              )),
            )}
          </div>
          {t(
            products.length > visible && (
              <AutoReveal total={products.length} visible={visible} setVisible={setVisible} />
            ),
          )}
          {t(
            !products.length && (
              <Empty title={t('Позиции не найдены')} text="Измените поиск или категорию." />
            ),
          )}
        </section>
        <aside className="day-receipt staff-day-receipt" aria-label={t('Сводка продаж за день')}>
          <div className="receipt-heading">
            <span className="staff-receipt-icon">
              <ReceiptText size={22} />
            </span>
            <div>
              <h2>{t('Продажи за день')}</h2>
              <p>{t(prettyDate)}</p>
            </div>
            <span className="count-badge" title={t('Разных позиций')}>
              {t(summary.size)}
            </span>
          </div>
          {t(
            history.loading ? (
              <LoadingStatus />
            ) : history.error ? (
              <p role="alert">{t(history.error)}</p>
            ) : sales.length > 0 ? (
              <>
                <div className="staff-summary-label">
                  <span>{t('Позиция')}</span>
                  <span>
                    {t('Количество')} · {t('Сумма')}
                  </span>
                </div>
                <div className="receipt-lines staff-summary-lines">
                  {t(
                    [...summary.entries()].map(([key, item]) => {
                      const product = staffData.products.find(
                        (p) => p.id === item.productId && p.kind === item.kind,
                      );
                      return (
                        <div className="staff-summary-row" key={key}>
                          <span className="staff-summary-thumb">
                            <CocktailArt
                              image={
                                product?.image
                                  ? menuImage({
                                      name: item.name,
                                      image: product.image,
                                      category: item.category,
                                    })
                                  : 12
                              }
                              name={item.name}
                              category={item.category}
                              serving={item.unit}
                            />
                          </span>
                          <strong>
                            {t(item.name)}
                            {t(
                              item.servingMl ? (
                                <small>
                                  {t('По')}
                                  {t(item.servingMl)}
                                  {t(' мл')}
                                </small>
                              ) : null,
                            )}
                          </strong>
                          <span className="staff-summary-quantity">
                            {t(label(item.quantity, item))}
                            <strong className="staff-sale-amount">{t(money(item.revenue))}</strong>
                          </span>
                        </div>
                      );
                    }),
                  )}
                </div>
                <div className="receipt-total">
                  <span>{t('Итого за день')}</span>
                  <strong>{t(money(revenue))}</strong>
                </div>
                <div className="staff-receipt-total">
                  <span>{t('Количество')}</span>
                  <div>
                    {t(
                      [...totalUnits].map(([unit, quantity]) => (
                        <strong key={unit}>
                          {t(new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(quantity))}
                          {t(' ')}
                          <small>{t(unit)}</small>
                        </strong>
                      )),
                    )}
                  </div>
                </div>
                <p className="staff-receipt-meta">
                  <CheckCircle2 size={14} />
                  {t(operationCount)}
                  {t(' записей ·')}
                  {t(summary.size)}
                  {t(' позиций')}
                </p>
              </>
            ) : (
              <Empty title={t('Продаж пока нет')} text="Выберите напиток слева и запишите первую продажу." />
            ),
          )}
          <div className="receipt-note">
            {t('Остатки списываются автоматически.')}
            <br />
            {t('Для исправления продажи обратитесь к владельцу.')}
          </div>
        </aside>
      </div>
      {t(creating && <StaffCocktailForm close={() => setCreating(false)} />)}
      {t(
        selected && (
          <Modal title={t(selected.name)} subtitle={`Продажа за ${date}`} close={() => setSelected(null)}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
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
            >
              {t(
                glassServing && (
                  <GlassVolumeField
                    value={glassMl}
                    onChange={setGlassMl}
                    max={current?.bottleSizeMl}
                    hint={`Спишется: ${Math.round((servingMl || 0) * (amount || 0))} мл`}
                  />
                ),
              )}
              {glassServing && !variableGlass && (
                <p className="form-warning">
                  {t('Попросите владельца указать объём бутылки и стандартного бокала на складе.')}
                </p>
              )}
              <Field
                label={
                  selected.unit === 'bottle'
                    ? 'Количество бутылок'
                    : selected.unit === 'glass' && selected.category === 'wine'
                      ? 'Количество бокалов'
                      : selected.kind === 'cocktail'
                        ? 'Количество порций'
                        : 'Объём продажи, мл'
                }
              >
                <input
                  type="number"
                  required
                  min={selected.kind === 'cocktail' ? 1 : 0.01}
                  step={selected.kind === 'cocktail' ? 1 : 0.01}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
              <div className="quick-values">
                {t(
                  (selected.kind === 'cocktail' ? [1, 2, 3, 5] : [30, 50, 100, 150, 500]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={amount === n ? 'selected' : ''}
                      onClick={() => setQuantity(String(n))}
                    >
                      {t(n)}
                      {t(selected.kind === 'alcohol' ? ' мл' : '')}
                    </button>
                  )),
                )}
              </div>
              {t(
                !current?.ready && (
                  <p className="form-warning">{t('Попросите владельца настроить эту позицию.')}</p>
                ),
              )}
              {t(
                available !== null && available !== undefined && current && (
                  <p className="form-help">
                    {t('Доступно:')}
                    {t(label(available, current))}
                  </p>
                ),
              )}
              <div className="form-total">
                <span>
                  {t('К оплате')}
                  <strong>{t(money(Number.isFinite(totalPrice) ? totalPrice : 0))}</strong>
                </span>
              </div>
              <Submit
                disabled={
                  !current?.ready ||
                  amount <= 0 ||
                  !Number.isFinite(amount) ||
                  (available !== null && available !== undefined && available < amount) ||
                  (variableGlass &&
                    (!Number.isInteger(servingMl) ||
                      servingMl <= 0 ||
                      servingMl > (current?.bottleSizeMl || 0))) ||
                  (current.kind === 'cocktail' && !Number.isInteger(amount)) ||
                  (!!staffData.archivedBefore && date < staffData.archivedBefore)
                }
              >
                {t('Записать продажу')}
              </Submit>
            </form>
          </Modal>
        ),
      )}
    </>
  );
}

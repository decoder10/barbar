import { AutoReveal } from '../ui/auto-reveal';
import { BusyButton } from '../ui/loading';
import { useHistory } from '../features/sales/use-history';
import { Pagination } from '../ui/pagination';
import { useSessionFilter } from '../presentation/use-session-filter';
import { menuQuantitySummary } from '../domain/quantity-summary';
import { useInventoryCalculations } from '../features/inventory/use-inventory-calculations';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GlassWater,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlcoholCard, CocktailCard } from '../features/catalog/cards';
import { Empty, Metric } from '../ui/layout';
import { ExportButton } from '../ui/export';
import { Modal } from '../ui/modal';
import { formatMoney as money } from '../presentation/currency/format-money';
import { businessDayHint, businessToday } from '../domain/business-day';
import { activeSales, categories, round, saleUnit, volume } from '../domain/model';
import type { Alcohol, Cocktail, Sale } from '../domain/types';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import { SaleForm } from '../features/sales/SaleForm';
import { locale, t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';
export default function Sales() {
  const { data, run, busy } = useBar();
  const inventory = useInventoryCalculations(data);
  const [date, setDate, currentShift] = useBusinessDate();
  const [category, setCategory] = useSessionFilter<string>('category', 'cocktail');
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('owner-sales');
  const [visible, setVisible] = useState(24);
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
  const query = search.trim().toLocaleLowerCase();
  const cocktails =
    category !== 'alcohol'
      ? data.cocktails.filter(
          (c) =>
            (category === 'all' || (c.category || 'cocktail') === category) &&
            c.name.toLocaleLowerCase().includes(query),
        )
      : [];
  const alcohol = ['all', 'alcohol'].includes(category)
    ? data.alcohol.filter((a) => a.category === 'alcohol' && a.name.toLocaleLowerCase().includes(query))
    : [];
  const popularity = new Map<string, number>();
  totals.forEach((s) =>
    popularity.set(
      `${s.kind}:${s.productId}`,
      (popularity.get(`${s.kind}:${s.productId}`) || 0) + ('operations' in s ? s.operations : 1),
    ),
  );
  const cocktailSortData = new Map(
    cocktails.map((c) => [
      c.id,
      {
        name: c.name,
        price: c.price,
        available: c.ingredients.length
          ? inventory.portions(c.ingredients)
          : c.extraCosts?.length
            ? Infinity
            : 0,
        popularity: popularity.get(`cocktail:${c.id}`),
      },
    ]),
  );
  cocktails.sort((a, b) => compareCatalog(cocktailSortData.get(a.id)!, cocktailSortData.get(b.id)!, sort));
  const alcoholSortData = new Map(
    alcohol.map((a) => [
      a.id,
      {
        name: a.name,
        price: a.pricePerLiter,
        available: inventory.stock(a.id),
        popularity: popularity.get(`alcohol:${a.id}`),
      },
    ]),
  );
  alcohol.sort((a, b) => compareCatalog(alcoholSortData.get(a.id)!, alcoholSortData.get(b.id)!, sort));
  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
  function changeDate(offset: number) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    const value = next.toISOString().slice(0, 10);
    if (value <= businessToday()) {
      setDate(value);
    }
  }
  return (
    <>
      <h1 className="visually-hidden">{t('Продажи за день')}</h1>
      <div className="sales-date-bar">
        <div className="date-control">
          <button aria-label={t('Предыдущий день')} onClick={() => changeDate(-1)}>
            <ChevronLeft size={16} />
          </button>
          <CalendarDays size={17} />
          <input
            aria-label={t('Дата продаж')}
            type="date"
            value={date}
            max={businessToday()}
            required
            onChange={(e) => {
              if (e.target.value && e.target.value <= businessToday()) {
                setDate(e.target.value);
              }
            }}
          />
          <button
            aria-label={t('Следующий день')}
            disabled={date >= businessToday()}
            onClick={() => changeDate(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <p className="business-day-hint">{t(businessDayHint)}</p>
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
      <div className="sales-layout">
        <section className="catalog">
          <div className="section-title">
            <div>
              <h2>{t('Что наливаем?')}</h2>
              <p>{t('Выберите напиток, чтобы записать продажу')}</p>
            </div>
            <Link className="text-link" to="/cocktails">
              <Plus size={15} />
              {t(' Коктейль')}
            </Link>
          </div>
          <div className="catalog-tools sales-catalog-tools">
            <div className="menu-categories">
              {t(
                [['all', 'Всё'], ...categories.map((c) => [c.id, c.label]), ['alcohol', 'В розлив']].map(
                  ([key, label]) => (
                    <button
                      aria-pressed={category === key}
                      key={key}
                      className={category === key ? 'active' : ''}
                      onClick={() => {
                        setCategory(key);
                        setVisible(24);
                      }}
                    >
                      {t(label)}
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
              options={['original', 'popular', 'available', 'name', 'name-desc', 'price', 'price-desc']}
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
              cocktails
                .slice(0, visible)
                .map((c) => (
                  <CocktailCard
                    key={c.id}
                    cocktail={c}
                    detail={
                      [...c.ingredients, ...(c.extraCosts || [])]
                        .map((i) => data.alcohol.find((a) => a.id === i.alcoholId)?.name)
                        .join(' · ') || 'Добавьте состав в редакторе'
                    }
                    footer={
                      <span
                        className={`stock-pill ${inventory.portions(c.ingredients) || (!c.ingredients.length && c.extraCosts?.length) ? '' : 'low'}`}
                      >
                        {t(
                          !c.ingredients.length && c.extraCosts?.length
                            ? 'По стоимости'
                            : inventory.portions(c.ingredients)
                              ? `${inventory.portions(c.ingredients)} порц.`
                              : c.ingredients.length || c.extraCosts?.length
                                ? 'Нет запаса'
                                : 'Нет состава',
                        )}
                      </span>
                    }
                    action={() => setSelected({ kind: 'cocktail', product: c })}
                  />
                )),
            )}
            {t(
              alcohol.map((a) => (
                <AlcoholCard
                  key={a.id}
                  drink={a}
                  ml={inventory.stock(a.id)}
                  action={() => setSelected({ kind: 'alcohol', product: a })}
                />
              )),
            )}
          </div>
          {t(
            cocktails.length > visible && (
              <AutoReveal total={cocktails.length} visible={visible} setVisible={setVisible} />
            ),
          )}
          {t(
            !cocktails.length && !alcohol.length && (
              <Empty title={t('Напитки не найдены')} text="Попробуйте другое название или измените фильтр." />
            ),
          )}
        </section>
        <aside className="day-receipt">
          <div className="receipt-heading">
            <span className="receipt-icon">
              <ReceiptText size={20} />
            </span>
            <div>
              <h2>{t('Продажи за день')}</h2>
              <p>{t(dayLabel)}</p>
            </div>
            <span className="count-badge">{t(operationCount)}</span>
          </div>
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
        </aside>
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

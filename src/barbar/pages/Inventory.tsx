import { inventoryGroup } from '../domain/inventory-groups';
import { InventoryCategories } from '../features/inventory/InventoryCategories';
import { useNearViewport } from '../ui/use-near-viewport';
import { useHistory } from '../features/sales/use-history';
import { Pagination } from '../ui/pagination';
import { useSessionFilter } from '../presentation/use-session-filter';
import { useInventoryCalculations } from '../features/inventory/use-inventory-calculations';
import {
  ArrowDownToLine,
  Boxes,
  CircleDollarSign,
  History,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InventoryProduct, InventoryStock, RecipeShortages } from '../features/inventory/InventoryProduct';
import { recipeShortages } from '../domain/shortages';
import { Empty, Metric, PageHeading } from '../ui/layout';
import { download, ExportButton } from '../ui/export';
import { FilterSheet, MenuButton, Sheet, SheetActions, type SheetAction } from '../ui/sheet';
import { useCompact } from '../ui/use-compact';
import { InventoryViewSwitch, useInventoryView } from '../features/inventory/view-switch';
import { formatMoney as money } from '../presentation/currency/format-money';
import { ingredientVolume, priceBasis, priceUnit, round, stockTotals, volume } from '../domain/model';
import type { Alcohol, Purchase } from '../domain/types';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import { AlcoholForm } from '../features/inventory/AlcoholForm';
import { CorrectPurchaseForm } from '../features/inventory/CorrectPurchaseForm';
import { PurchaseForm } from '../features/inventory/PurchaseForm';
import { ResetStockForm } from '../features/inventory/ResetStockForm';
import { locale, t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
export default function Inventory() {
  const [params] = useSearchParams();
  const { data } = useBar();
  const compact = useCompact();
  // Phones open the histories in sheets instead of rendering them below the stock list.
  const [historySheet, setHistorySheet] = useState<'purchases' | 'resets' | null>(null);
  const [rowMenu, setRowMenu] = useState<Alcohol | null>(null);
  const historySection = useNearViewport();
  const purchaseHistory = useHistory<import('../domain/types').Purchase>(
    'purchases',
    '1900-01-01',
    '9999-12-31',
    historySection.active || !!historySheet,
  );
  const purchases = purchaseHistory.enabled ? purchaseHistory.rows : data.purchases;
  const resetHistory = useHistory<import('../domain/types').StockReset>(
    'stockResets',
    '1900-01-01',
    '9999-12-31',
    historySection.active || !!historySheet,
  );
  const resets = resetHistory.enabled ? resetHistory.rows : [...(data.stockResets || [])].reverse();
  const inventory = useInventoryCalculations(data);
  const quantities = useMemo(() => stockTotals(data), [data]);
  const remaining = (id: string) => quantities.get(id) || 0;
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('owner-stock');
  const [view, setView] = useInventoryView();
  const [category, setCategory] = useSessionFilter<string>('category', 'all');
  const [newCategory, setNewCategory] = useState<Alcohol['category']>('alcohol');
  const [edit, setEdit] = useState<Alcohol | 'new' | null>(
    () => data.alcohol.find((a) => a.id === params.get('edit')) || null,
  );
  const [purchase, setPurchase] = useState<string | null>(null);
  const [correction, setCorrection] = useState<Purchase | null>(null);
  const [reset, setReset] = useState<Alcohol | null>(null);
  const filtered = data.alcohol.filter(
    (a) =>
      a.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (category === 'all' || inventoryGroup(a) === category),
  );
  filtered.sort((a, b) =>
    compareCatalog(
      { name: a.name, available: remaining(a.id), price: a.pricePerLiter },
      { name: b.name, available: remaining(b.id), price: b.pricePerLiter },
      sort,
    ),
  );
  const totalMl = data.alcohol
    .filter((a) => !a.unit || a.unit === 'ml')
    .reduce((n, a) => n + remaining(a.id), 0);
  const worth = data.alcohol.reduce(
    (n, a) => n + (remaining(a.id) * inventory.averageCost(a.id)) / priceBasis(data, a.id),
    0,
  );
  const shortages = recipeShortages(data.cocktails, remaining);
  const newItems: SheetAction[] = (
    [
      ['alcohol', 'Новый напиток'],
      ['beer', 'Новое пиво'],
      ['wine', 'Новое вино'],
      ['cognac', 'Новый коньяк'],
      ['food', 'Продукт'],
      ['goods', 'Товар целиком'],
    ] as const
  ).map(([type, label]) => ({
    label,
    icon: <Plus size={19} />,
    onClick: () => {
      setNewCategory(type);
      setEdit('new');
    },
  }));
  const sortControl = (
    <CatalogSortControl
      value={sort}
      onChange={(value) => {
        setSort(value);
      }}
      options={['original', 'missing', 'available', 'name', 'name-desc', 'price', 'price-desc']}
    />
  );
  const unitOf = (id: string) => data.alcohol.find((a) => a.id === id)?.unit;
  return (
    <>
      <PageHeading
        eyebrow="ВСЁ НА СВОИХ ПОЛКАХ"
        title={t('Склад напитков')}
        description="Закупки складываются. Продажи списываются. Остатки всегда перед глазами."
      >
        {compact ? (
          <>
            <button className="button primary" onClick={() => setPurchase('')}>
              <PackagePlus size={17} />
              {t('Закупка')}
            </button>
            <MenuButton
              label="Добавить"
              title="Новая позиция склада"
              icon={<Plus size={17} />}
              actions={newItems}
            >
              {t('Добавить')}
            </MenuButton>
            <MenuButton
              label="Ещё действия"
              className="button secondary heading-more"
              icon={<MoreHorizontal size={20} />}
              actions={[
                {
                  label: 'История закупок',
                  icon: <History size={19} />,
                  onClick: () => setHistorySheet('purchases'),
                },
                {
                  label: 'История сбросов',
                  icon: <RotateCcw size={19} />,
                  onClick: () => setHistorySheet('resets'),
                },
                {
                  label: 'Скачать JSON',
                  icon: <ArrowDownToLine size={19} />,
                  onClick: () => download('alcohol.json', data.alcohol),
                },
              ]}
            />
          </>
        ) : (
          <>
            <button
              className="button secondary"
              onClick={() => {
                setNewCategory('alcohol');
                setEdit('new');
              }}
            >
              <Plus size={17} />
              {t(' Новый напиток')}
            </button>
            {t(
              (['beer', 'wine', 'cognac'] as const).map((type) => (
                <button
                  key={type}
                  className="button secondary"
                  onClick={() => {
                    setNewCategory(type);
                    setEdit('new');
                  }}
                >
                  <Plus size={17} />
                  {t(type === 'beer' ? 'Новое пиво' : type === 'wine' ? 'Новое вино' : 'Новый коньяк')}
                </button>
              )),
            )}
            <button
              className="button secondary"
              onClick={() => {
                setNewCategory('food');
                setEdit('new');
              }}
            >
              <Plus size={17} />
              {t(' Продукт')}
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setNewCategory('goods');
                setEdit('new');
              }}
            >
              <Plus size={17} />
              {t(' Товар целиком')}
            </button>
            <button className="button primary" onClick={() => setPurchase('')}>
              <PackagePlus size={17} />
              {t(' Добавить закупку')}
            </button>
          </>
        )}
      </PageHeading>
      <section className="metrics">
        <Metric
          label="Напитков в каталоге"
          value={String(data.alcohol.length)}
          hint="Алкоголь, продукты и миксеры"
          icon={<Boxes size={18} />}
          accent
        />
        <Metric
          label="Общий остаток"
          value={volume(totalMl)}
          hint={`Отдельно в бутылках: ${round(data.alcohol.filter((a) => a.unit === 'bottle').reduce((sum, a) => sum + remaining(a.id), 0))} бут.`}
          icon={<ArrowDownToLine size={18} />}
        />
        <Metric
          label="Стоимость запасов"
          value={money(round(worth))}
          hint="По закупочным ценам"
          icon={<CircleDollarSign size={18} />}
        />
        <Metric
          label="Не хватает для рецептов"
          value={String(shortages.size)}
          hint="Ингредиентов для одной порции"
          icon={<TriangleAlert size={18} />}
        />
      </section>
      <section className="panel">
        {!compact && (
          <div className="section-title">
            <div>
              <h2>{t('Ваш барный запас')}</h2>
              <p>
                {t(
                  'Красным выделены ингредиенты, которых не хватает на одну порцию по сохранённым рецептам.',
                )}
              </p>
            </div>
            <ExportButton name="alcohol.json" value={data.alcohol} />
          </div>
        )}
        <div className="catalog-tools">
          <InventoryCategories value={category} onChange={setCategory} items={data.alcohol} />
          {compact ? (
            <FilterSheet active={sort !== 'original' || view === 'grid'}>
              {sortControl}
              <InventoryViewSwitch view={view} onChange={setView} />
            </FilterSheet>
          ) : (
            sortControl
          )}
          <label className="search">
            <Search size={17} />
            <input
              aria-label={t('Поиск на складе')}
              placeholder={t('Найти на полке…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {!compact && <InventoryViewSwitch view={view} onChange={setView} />}
        </div>
        {!compact && (
          <p className="inventory-recipe-help">
            {t('Позиции без состава не проверяются. Добавьте ингредиенты в разделе «Меню и рецепты».')}
          </p>
        )}
        <div className={`table-scroll inventory-layout ${view === 'grid' ? 'inventory-grid-view' : ''}`}>
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>{t('Напиток')}</th>
                <th>{t('Остаток')}</th>
                <th>{t('Ср. закупочная цена')}</th>
                <th>{t('Продажная цена')}</th>
                <th>{t('Действия')}</th>
              </tr>
            </thead>
            <tbody>
              {t(
                filtered.map((a) => (
                  <tr
                    key={a.id}
                    className={shortages.has(a.id) || remaining(a.id) <= 0 ? 'inventory-shortage' : undefined}
                  >
                    <td onClick={compact ? () => setRowMenu(a) : undefined}>
                      <InventoryProduct drink={a} />
                    </td>
                    <td>
                      <InventoryStock
                        quantity={ingredientVolume(data, a.id, remaining(a.id))}
                        unavailable={remaining(a.id) <= 0}
                        low={shortages.has(a.id) || remaining(a.id) <= 0}
                      >
                        {shortages.has(a.id) && (
                          <RecipeShortages
                            shortages={shortages.get(a.id)!}
                            format={(amount) => ingredientVolume(data, a.id, amount)}
                          />
                        )}
                      </InventoryStock>
                    </td>
                    <td data-label="Ср. закупочная цена">
                      {t(money(round(inventory.averageCost(a.id))))}
                      <small className="muted"> / {t(priceUnit(a.unit))}</small>
                    </td>
                    <td data-label="Продажная цена">
                      {t(
                        a.pricePerLiter ? (
                          money(a.pricePerLiter)
                        ) : (
                          <span className="muted">{t('Не задана')}</span>
                        ),
                      )}
                      <small className="muted"> / {t(priceUnit(a.unit))}</small>
                    </td>
                    <td>
                      {compact ? (
                        <button
                          className="icon-button row-menu"
                          aria-label={t(`Действия: ${a.name}`)}
                          aria-haspopup="dialog"
                          onClick={() => setRowMenu(a)}
                        >
                          <MoreHorizontal size={20} />
                        </button>
                      ) : (
                        <div className="row-actions">
                          <button className="button small secondary" onClick={() => setPurchase(a.id)}>
                            <Plus size={14} />
                            {t(' Закупка')}
                          </button>
                          <button
                            className="button small secondary"
                            aria-label={t(`Сбросить остаток ${a.name}`)}
                            disabled={remaining(a.id) <= 0}
                            onClick={() => setReset(a)}
                          >
                            <RotateCcw size={14} />
                            {t(' Сброс')}
                          </button>
                          <button
                            className="icon-button"
                            aria-label={t(`Изменить ${a.name}`)}
                            onClick={() => setEdit(a)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {t(
          !filtered.length && (
            <Empty
              title={t('На этой полке пока пусто')}
              text="Добавьте напиток или измените поисковый запрос."
            />
          ),
        )}
      </section>
      {!compact && (
        <section className="panel" ref={historySection.ref}>
          <div className="section-title">
            <div>
              <h2>{t('История закупок')}</h2>
              <p>{t('Каждая поставка сохраняется отдельной записью')}</p>
            </div>
            <ExportButton name="purchases-page.json" value={purchases} />
            <Pagination page={purchaseHistory} />
          </div>
          {t(
            purchases.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('Дата')}</th>
                      <th>{t('Напиток')}</th>
                      <th>{t('Количество')}</th>
                      <th>{t('Закупочная цена')}</th>
                      <th>{t('Сумма')}</th>
                      <th>{t('Действия')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t(
                      [...purchases]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((p) => (
                          <tr key={p.id}>
                            <td>{t(new Date(`${p.date}T12:00:00`).toLocaleDateString(locale()))}</td>
                            <td>{t(data.alcohol.find((a) => a.id === p.alcoholId)?.name)}</td>
                            <td>{t(ingredientVolume(data, p.alcoholId, p.ml))}</td>
                            <td>
                              {t(money(p.costPerLiter))} /{t(' ')}
                              {t(priceUnit(data.alcohol.find((a) => a.id === p.alcoholId)?.unit))}
                            </td>
                            <td>
                              <strong>
                                {t(money(round((p.ml * p.costPerLiter) / priceBasis(data, p.alcoholId))))}
                              </strong>
                            </td>
                            <td>
                              <button
                                className="button small secondary"
                                onClick={() => setCorrection(p)}
                                disabled={!!data.archived && p.date < data.archived.before}
                              >
                                <Pencil size={14} />
                                {t(' Исправить / удалить')}
                              </button>
                            </td>
                          </tr>
                        )),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title={t('Начните с первой закупки')}
                text="Выберите марку, укажите купленное количество и закупочную цену."
              />
            ),
          )}
        </section>
      )}
      {t(
        !compact && (!!resets.length || resetHistory.loading || !!resetHistory.error) && (
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>{t('История сбросов')}</h2>
                <p>{t('Списания запасов при обнулении остатков')}</p>
              </div>
              <Pagination page={resetHistory} />
              <ExportButton name="stock-resets-page.json" value={resets} />
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('Дата')}</th>
                    <th>{t('Напиток')}</th>
                    <th>{t('Списано')}</th>
                    <th>{t('Стоимость списания')}</th>
                  </tr>
                </thead>
                <tbody>
                  {t(
                    resets.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {t(new Date(r.createdAt).toLocaleString(locale(), { timeZone: 'Asia/Yerevan' }))}
                        </td>
                        <td>{t(r.name)}</td>
                        <td>{t(ingredientVolume(data, r.alcoholId, r.ml))}</td>
                        <td>{t(money(r.cost))}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ),
      )}
      {rowMenu && (
        <Sheet
          title={rowMenu.name}
          subtitle={`${t('Остаток')}: ${ingredientVolume(data, rowMenu.id, remaining(rowMenu.id))}`}
          close={() => setRowMenu(null)}
        >
          <dl className="sheet-facts">
            <div>
              <dt>{t('Ср. закупочная цена')}</dt>
              <dd>
                {t(money(round(inventory.averageCost(rowMenu.id))))} / {t(priceUnit(rowMenu.unit))}
              </dd>
            </div>
            <div>
              <dt>{t('Продажная цена')}</dt>
              <dd>
                {rowMenu.pricePerLiter
                  ? `${t(money(rowMenu.pricePerLiter))} / ${t(priceUnit(rowMenu.unit))}`
                  : t('Не задана')}
              </dd>
            </div>
          </dl>
          <SheetActions
            close={() => setRowMenu(null)}
            actions={[
              {
                label: 'Добавить закупку',
                icon: <PackagePlus size={19} />,
                onClick: () => setPurchase(rowMenu.id),
              },
              { label: 'Изменить', icon: <Pencil size={19} />, onClick: () => setEdit(rowMenu) },
              {
                label: 'Сбросить остаток',
                icon: <RotateCcw size={19} />,
                disabled: remaining(rowMenu.id) <= 0,
                onClick: () => setReset(rowMenu),
              },
            ]}
          />
        </Sheet>
      )}
      {historySheet === 'purchases' && (
        <Sheet
          title="История закупок"
          subtitle="Каждая поставка сохраняется отдельной записью"
          close={() => setHistorySheet(null)}
        >
          <Pagination page={purchaseHistory} />
          {purchases.length ? (
            <div className="compact-list">
              {[...purchases]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((p) => (
                  <div className="compact-list-row" key={p.id}>
                    <div>
                      <strong>{t(data.alcohol.find((a) => a.id === p.alcoholId)?.name)}</strong>
                      <small>
                        {t(new Date(`${p.date}T12:00:00`).toLocaleDateString(locale()))} ·{' '}
                        {t(ingredientVolume(data, p.alcoholId, p.ml))} · {t(money(p.costPerLiter))} /{' '}
                        {t(priceUnit(unitOf(p.alcoholId)))}
                      </small>
                    </div>
                    <b>{t(money(round((p.ml * p.costPerLiter) / priceBasis(data, p.alcoholId))))}</b>
                    <button
                      className="icon-button"
                      aria-label={t('Исправить / удалить')}
                      disabled={!!data.archived && p.date < data.archived.before}
                      onClick={() => setCorrection(p)}
                    >
                      <Pencil size={17} />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <Empty
              title={t('Начните с первой закупки')}
              text="Выберите марку, укажите купленное количество и закупочную цену."
            />
          )}
        </Sheet>
      )}
      {historySheet === 'resets' && (
        <Sheet
          title="История сбросов"
          subtitle="Списания запасов при обнулении остатков"
          close={() => setHistorySheet(null)}
        >
          <Pagination page={resetHistory} />
          {resets.length ? (
            <div className="compact-list">
              {resets.map((r) => (
                <div className="compact-list-row" key={r.id}>
                  <div>
                    <strong>{t(r.name)}</strong>
                    <small>
                      {t(new Date(r.createdAt).toLocaleString(locale(), { timeZone: 'Asia/Yerevan' }))} ·{' '}
                      {t(ingredientVolume(data, r.alcoholId, r.ml))}
                    </small>
                  </div>
                  <b>{t(money(r.cost))}</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty title={t('Сбросов пока нет')} text="Здесь появятся обнулённые остатки." />
          )}
        </Sheet>
      )}
      {t(correction && <CorrectPurchaseForm purchase={correction} close={() => setCorrection(null)} />)}
      {t(reset && <ResetStockForm alcohol={reset} close={() => setReset(null)} />)}
      {t(
        edit && (
          <AlcoholForm
            initialCategory={newCategory}
            alcohol={edit === 'new' ? undefined : edit}
            close={() => setEdit(null)}
          />
        ),
      )}
      {t(
        purchase !== null && (
          <PurchaseForm alcoholId={purchase || undefined} close={() => setPurchase(null)} />
        ),
      )}
    </>
  );
}

export { PurchaseForm };

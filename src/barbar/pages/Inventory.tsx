import { useSessionFilter } from '../presentation/use-session-filter';
import { useInventoryCalculations } from '../features/inventory/use-inventory-calculations';
import {
  ArrowDownToLine,
  Boxes,
  CircleDollarSign,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottleArt } from '../features/catalog/art';
import { Empty, Metric, PageHeading } from '../ui/layout';
import { ExportButton } from '../ui/export';
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
      (category === 'all' || a.category === category),
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
  const shortages = new Map<string, { id: string; name: string; required: number; missing: number }[]>();
  for (const recipe of data.cocktails) {
    for (const ingredient of recipe.ingredients) {
      const missing = round(ingredient.ml - remaining(ingredient.alcoholId));
      if (missing > 0) {
        const items = shortages.get(ingredient.alcoholId) || [];
        items.push({ id: recipe.id, name: recipe.name, required: ingredient.ml, missing });
        shortages.set(ingredient.alcoholId, items);
      }
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ВСЁ НА СВОИХ ПОЛКАХ"
        title={t('Склад напитков')}
        description="Закупки складываются. Продажи списываются. Остатки всегда перед глазами."
      >
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
        <button className="button primary" onClick={() => setPurchase('')}>
          <PackagePlus size={17} />
          {t(' Добавить закупку')}
        </button>
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
        <div className="section-title">
          <div>
            <h2>{t('Ваш барный запас')}</h2>
            <p>
              {t('Красным выделены ингредиенты, которых не хватает на одну порцию по сохранённым рецептам.')}
            </p>
          </div>
          <ExportButton name="alcohol.json" value={data.alcohol} />
        </div>
        <div className="catalog-tools">
          <div className="segmented inventory-categories">
            {t(
              [
                ['all', 'Все'],
                ['alcohol', 'Алкоголь в розлив'],
                ['beer', 'Пиво'],
                ['wine', 'Вино'],
                ['cognac', 'Коньяк'],
                ['mixer', 'Продукты и миксеры'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={category === id ? 'active' : ''}
                  aria-pressed={category === id}
                  onClick={() => setCategory(id)}
                >
                  {t(label)}
                </button>
              )),
            )}
          </div>
          <CatalogSortControl
            value={sort}
            onChange={(value) => {
              setSort(value);
            }}
            options={['original', 'missing', 'available', 'name', 'name-desc', 'price', 'price-desc']}
          />
          <label className="search">
            <Search size={17} />
            <input
              aria-label={t('Поиск на складе')}
              placeholder={t('Найти на полке…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <InventoryViewSwitch view={view} onChange={setView} />
        </div>
        <p className="inventory-recipe-help">
          {t('Позиции без состава не проверяются. Добавьте ингредиенты в разделе «Меню и рецепты».')}
        </p>
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
                    <td>
                      <div className="table-product">
                        <BottleArt drink={a} />
                        <span>
                          <strong>{t(a.name)}</strong>
                          <small>
                            {t(
                              a.category === 'beer'
                                ? 'Пиво'
                                : a.category === 'wine'
                                  ? 'Вино'
                                  : a.category === 'cognac'
                                    ? 'Коньяк'
                                    : a.category === 'mixer'
                                      ? 'Продукт / миксер'
                                      : 'Алкоголь',
                            )}
                            {t(a.bottleSizeMl ? ` · ${a.bottleSizeMl} мл/бут.` : '')}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`stock-pill ${shortages.has(a.id) || remaining(a.id) <= 0 ? 'low' : ''}`}
                      >
                        {t(ingredientVolume(data, a.id, remaining(a.id)))}
                      </span>
                      {t(
                        remaining(a.id) <= 0 && (
                          <span className="stock-unavailable-label">{t('Нет в наличии')}</span>
                        ),
                      )}
                      {t(
                        shortages.has(a.id) && (
                          <details className="inventory-shortage-details">
                            <summary>
                              <TriangleAlert size={13} aria-hidden="true" />
                              {t(' Не хватает для рецептов:')}
                              {t(' ')}
                              {t(shortages.get(a.id)!.length)}
                            </summary>
                            <ul>
                              {t(
                                shortages.get(a.id)!.map((recipe) => (
                                  <li key={recipe.id}>
                                    <strong>{t(recipe.name)}</strong>
                                    <span>
                                      {t('На порцию нужно ')}
                                      {t(ingredientVolume(data, a.id, recipe.required))}
                                      {t('; не хватает')}
                                      {t(' ')}
                                      {t(ingredientVolume(data, a.id, recipe.missing))}.
                                    </span>
                                  </li>
                                )),
                              )}
                            </ul>
                          </details>
                        ),
                      )}
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
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{t('История закупок')}</h2>
            <p>{t('Каждая поставка сохраняется отдельной записью')}</p>
          </div>
          <ExportButton name="purchases.json" value={data.purchases} />
        </div>
        {t(
          data.purchases.length ? (
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
                    [...data.purchases]
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
      {t(
        !!data.stockResets?.length && (
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>{t('История сбросов')}</h2>
                <p>{t('Списания запасов при обнулении остатков')}</p>
              </div>
              <ExportButton name="stock-resets.json" value={data.stockResets} />
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
                    [...data.stockResets].reverse().map((r) => (
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

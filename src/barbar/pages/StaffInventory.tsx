import { InventoryCategories } from '../features/inventory/InventoryCategories';
import { useSessionFilter } from '../presentation/use-session-filter';
import { Boxes, Search, TriangleAlert } from 'lucide-react';
import { InventoryProduct, InventoryStock } from '../features/inventory/InventoryProduct';
import { Empty, Metric, PageHeading } from '../ui/layout';
import { InventoryViewSwitch, useInventoryView } from '../features/inventory/view-switch';
import { unitLabel } from '../domain/model';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import { locale, t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';

export default function StaffInventory() {
  const { staffData } = useBar();
  const [category, setCategory] = useSessionFilter<string>('category', 'all');
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('worker-stock', 'missing');
  const [view, setView] = useInventoryView();
  const [missingOnly, setMissingOnly] = useSessionFilter<boolean>('missingOnly', false);
  if (!staffData) return <p className="muted">{t('Загружаем склад…')}</p>;
  const items = staffData.ingredients;
  const missing = items.filter((a) => a.available <= 0).length;
  const filtered = items
    .filter(
      (a) =>
        (category === 'all' || a.category === category) &&
        (!missingOnly || a.available <= 0) &&
        a.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => compareCatalog(a, b, sort));
  return (
    <>
      <PageHeading
        eyebrow="BARBAR · СКЛАД"
        title={t('Остатки на складе')}
        description="Проверяйте наличие напитков и ингредиентов. Для пополнения обратитесь к администратору."
      />
      <section className="metrics staff-metrics">
        <Metric
          label="В наличии"
          value={String(items.length - missing)}
          hint="Позиций с ненулевым остатком"
          icon={<Boxes size={18} />}
          accent
        />
        <Metric
          label="Нет в наличии"
          value={String(missing)}
          hint="Позиций с нулевым остатком"
          icon={<TriangleAlert size={18} />}
        />
      </section>
      <section className="panel">
        <div className="catalog-tools">
          <InventoryCategories value={category} onChange={setCategory} />
          <CatalogSortControl
            value={sort}
            onChange={(value) => {
              setSort(value);
            }}
            options={['missing', 'available', 'name', 'name-desc']}
          />
          <label className="search">
            <Search size={17} />
            <input
              aria-label={t('Поиск на складе')}
              placeholder={t('Марка или ингредиент…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <InventoryViewSwitch view={view} onChange={setView} />
        </div>
        <div className="segmented">
          <button
            className={!missingOnly ? 'active' : ''}
            aria-pressed={!missingOnly}
            onClick={() => setMissingOnly(false)}
          >
            {t('Все остатки')}
          </button>
          <button
            className={missingOnly ? 'active' : ''}
            aria-pressed={missingOnly}
            onClick={() => setMissingOnly(true)}
          >
            {t('Нет в наличии')}
          </button>
        </div>
        <div className={`table-scroll inventory-layout ${view === 'grid' ? 'inventory-grid-view' : ''}`}>
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>{t('Марка / ингредиент')}</th>
                <th>{t('Остаток')}</th>
              </tr>
            </thead>
            <tbody>
              {t(
                filtered.map((a) => {
                  return (
                    <tr key={a.id} className={a.available <= 0 ? 'inventory-shortage' : ''}>
                      <td>
                        <InventoryProduct drink={a} />
                      </td>
                      <td>
                        <InventoryStock
                          quantity={`${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(a.available)} ${unitLabel(a.unit)}`}
                          unavailable={a.available <= 0}
                          low={a.available <= 0}
                        />
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        {t(!filtered.length && <Empty title={t('Позиций не найдено')} text="Измените поиск или фильтры." />)}
      </section>
    </>
  );
}

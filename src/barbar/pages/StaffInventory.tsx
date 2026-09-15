import { inventoryGroup } from '../domain/inventory-groups';
import { InventoryCategories } from '../features/inventory/InventoryCategories';
import { useSessionFilter } from '../presentation/use-session-filter';
import { ArrowDownToLine, Boxes, Search, TriangleAlert } from 'lucide-react';
import { InventoryProduct, InventoryStock, RecipeShortages } from '../features/inventory/InventoryProduct';
import { Empty, Metric, PageHeading } from '../ui/layout';
import { InventoryViewSwitch, useInventoryView } from '../features/inventory/view-switch';
import { ingredientVolume, round, volume } from '../domain/model';
import { recipeShortages } from '../domain/shortages';
import { CatalogSortControl, compareCatalog, useCatalogSort } from '../features/catalog/sort';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { FilterSheet } from '../ui/sheet';
import { useCompact } from '../ui/use-compact';

/** Worker stock: the owner's table and shortages without purchase prices, stock value or stock controls. */
export default function StaffInventory() {
  const { staffData } = useBar();
  const [category, setCategory] = useSessionFilter<string>('category', 'all');
  const [search, setSearch] = useSessionFilter<string>('search', '');
  const [sort, setSort] = useCatalogSort('worker-stock', 'missing');
  const [view, setView] = useInventoryView();
  const [missingOnly, setMissingOnly] = useSessionFilter<boolean>('missingOnly', false);
  const compact = useCompact();
  if (!staffData) return <p className="muted">{t('Загружаем склад…')}</p>;
  const items = staffData.ingredients;
  const units = { alcohol: items };
  const remaining = (id: string) => items.find((a) => a.id === id)?.available || 0;
  const shortages = recipeShortages(staffData.recipes, remaining);
  const filtered = items
    .filter(
      (a) =>
        (category === 'all' || inventoryGroup(a) === category) &&
        (!missingOnly || a.available <= 0) &&
        a.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => compareCatalog(a, b, sort));
  const sortControl = (
    <CatalogSortControl
      value={sort}
      onChange={(value) => {
        setSort(value);
      }}
      options={['missing', 'available', 'name', 'name-desc']}
    />
  );
  const availabilityFilter = (
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
  );
  return (
    <>
      <PageHeading
        eyebrow="ВСЁ НА СВОИХ ПОЛКАХ"
        title={t('Остатки на складе')}
        description="Проверяйте наличие напитков и ингредиентов. Для пополнения обратитесь к администратору."
      />
      <section className="metrics">
        <Metric
          label="Напитков в каталоге"
          value={String(items.length)}
          hint="Алкоголь, продукты и миксеры"
          icon={<Boxes size={18} />}
          accent
        />
        <Metric
          label="Общий остаток"
          value={volume(items.filter((a) => !a.unit || a.unit === 'ml').reduce((n, a) => n + a.available, 0))}
          hint={`Отдельно в бутылках: ${round(items.filter((a) => a.unit === 'bottle').reduce((n, a) => n + a.available, 0))} бут.`}
          icon={<ArrowDownToLine size={18} />}
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
          </div>
        )}
        <div className="catalog-tools">
          <InventoryCategories value={category} onChange={setCategory} items={items} />
          {compact ? (
            <FilterSheet active={sort !== 'missing' || view === 'grid' || missingOnly}>
              {sortControl}
              <InventoryViewSwitch view={view} onChange={setView} />
              {availabilityFilter}
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
        {!compact && availabilityFilter}
        <div className={`table-scroll inventory-layout ${view === 'grid' ? 'inventory-grid-view' : ''}`}>
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>{t('Напиток')}</th>
                <th>{t('Остаток')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className={shortages.has(a.id) || a.available <= 0 ? 'inventory-shortage' : undefined}
                >
                  <td>
                    <InventoryProduct drink={a} />
                  </td>
                  <td>
                    <InventoryStock
                      quantity={ingredientVolume(units, a.id, a.available)}
                      unavailable={a.available <= 0}
                      low={shortages.has(a.id) || a.available <= 0}
                    >
                      {shortages.has(a.id) && (
                        <RecipeShortages
                          shortages={shortages.get(a.id)!}
                          format={(amount) => ingredientVolume(units, a.id, amount)}
                        />
                      )}
                    </InventoryStock>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty title={t('На этой полке пока пусто')} text="Измените поиск или фильтры." />
        )}
      </section>
    </>
  );
}

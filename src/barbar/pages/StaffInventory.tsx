import { useState } from 'react';
import { Boxes, Search, TriangleAlert } from 'lucide-react';
import { BottleArt, CocktailArt, Empty, Metric, PageHeading } from '../components';
import { menuImage } from '../images';
import { unitLabel } from '../model';
import { useBar } from '../store';

const categories = [
  ['all', 'Все'],
  ['beer', 'Пиво'],
  ['wine', 'Вино'],
  ['cognac', 'Коньяк'],
  ['alcohol', 'Алкоголь в розлив'],
  ['mixer', 'Продукты и миксеры'],
];

export default function StaffInventory() {
  const { staffData } = useBar();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  if (!staffData) return <p className="muted">Загружаем склад…</p>;
  const items = staffData.ingredients;
  const missing = items.filter((a) => a.available <= 0).length;
  const filtered = items
    .filter(
      (a) =>
        (category === 'all' || a.category === category) &&
        (!missingOnly || a.available <= 0) &&
        a.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => Number(a.available > 0) - Number(b.available > 0) || a.name.localeCompare(b.name, 'ru'));
  return (
    <>
      <PageHeading
        eyebrow="BARBAR · СКЛАД"
        title="Остатки на складе"
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
          <div className="segmented inventory-categories">
            {categories.map(([id, label]) => (
              <button
                key={id}
                className={category === id ? 'active' : ''}
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Поиск на складе"
              placeholder="Марка или ингредиент…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="segmented">
          <button
            className={!missingOnly ? 'active' : ''}
            aria-pressed={!missingOnly}
            onClick={() => setMissingOnly(false)}
          >
            Все остатки
          </button>
          <button
            className={missingOnly ? 'active' : ''}
            aria-pressed={missingOnly}
            onClick={() => setMissingOnly(true)}
          >
            Нет в наличии
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table staff-inventory-table">
            <thead>
              <tr>
                <th>Марка / ингредиент</th>
                <th>Остаток</th>
                <th>Наличие</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const recipe = staffData.recipes.find(
                  (c) =>
                    !c.editable &&
                    c.ingredients.length === 1 &&
                    c.ingredients[0].alcoholId === a.id &&
                    c.ingredients[0].ml === 1,
                );
                return (
                  <tr key={a.id} className={a.available <= 0 ? 'staff-stock-missing' : ''}>
                    <td>
                      <div className="table-product">
                        <div className="staff-stock-art">
                          {recipe && ['beer', 'wine'].includes(a.category) ? (
                            <CocktailArt image={menuImage(recipe)} name={a.name} />
                          ) : (
                            <BottleArt drink={a} />
                          )}
                        </div>
                        <span>
                          <strong>{a.name}</strong>
                          <small className="table-subtitle">
                            {categories.find(([id]) => id === a.category)?.[1]}
                            {a.bottleSizeMl ? ` · ${a.bottleSizeMl} мл/бут.` : ''}
                          </small>
                          <small className="staff-mobile-availability">
                            {a.available <= 0 ? 'Нет в наличии' : 'В наличии'}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(a.available)}{' '}
                      {unitLabel(a.unit)}
                    </td>
                    <td>
                      <span className={`stock-pill ${a.available <= 0 ? 'low' : ''}`}>
                        {a.available <= 0 && <TriangleAlert size={13} aria-hidden="true" />}
                        {a.available <= 0 ? 'Нет в наличии' : 'В наличии'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty title="Позиций не найдено" text="Измените поиск или фильтры." />}
      </section>
    </>
  );
}

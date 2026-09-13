import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, GlassWater, Search, ShoppingBag, Plus } from 'lucide-react';
import { CocktailArt, Empty, Field, Metric, Modal, PageHeading, Submit } from '../components';
import { categories, categoryLabel, saleUnit, today, volume } from '../model';
import { menuImage } from '../images';
import { useBar } from '../store';
import StaffCocktailForm from '../StaffCocktailForm';
import type { StaffProduct } from '../types';

export default function StaffSales() {
  const { staffData, run } = useBar();
  const [creating, setCreating] = useState(false);
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(24);
  const [selected, setSelected] = useState<StaffProduct | null>(null);
  const [quantity, setQuantity] = useState('1');
  if (!staffData) return <p className="muted">Загружаем продажи…</p>;
  const day = staffData.sales.filter((sale) => sale.date === date);
  const sales = day.filter((sale) => !sale.voided);
  const summary = new Map<
    string,
    {
      name: string;
      kind: StaffProduct['kind'];
      unit?: StaffProduct['unit'];
      category?: import('../types').MenuCategory;
      quantity: number;
    }
  >();
  for (const sale of sales) {
    const key = `${sale.kind}:${sale.productId}`;
    const item = summary.get(key) || {
      name: sale.name,
      kind: sale.kind,
      unit: sale.unit,
      category: sale.category,
      quantity: 0,
    };
    item.quantity += sale.quantity;
    summary.set(key, item);
  }
  const count = sales.filter((s) => s.kind === 'cocktail').reduce((n, s) => n + s.quantity, 0);
  const ml = sales.filter((s) => s.kind === 'alcohol').reduce((n, s) => n + s.quantity, 0);
  const products = staffData.products.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const label = (n: number, item: { kind: string; unit?: StaffProduct['unit']; category?: string }) =>
    `${n} ${saleUnit({ ...item, category: item.category === 'alcohol' ? undefined : (item.category as import('../types').MenuCategory) })}`;
  const changeDate = (offset: number) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    const next = value.toISOString().slice(0, 10);
    if (next <= today()) setDate(next);
  };
  // Availability can change while the form is open on another device.
  const current =
    selected && staffData.products.find((p) => p.id === selected.id && p.kind === selected.kind);
  const amount = Number(quantity);
  return (
    <>
      <PageHeading
        eyebrow="BARBAR · ПРОДАЖИ"
        title="Продажи за день"
        description="Записывайте продажи и смотрите, сколько продано по каждой позиции."
      >
        <div className="staff-heading-actions">
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Добавить коктейль
          </button>
          <div className="date-control">
            <button aria-label="Предыдущий день" onClick={() => changeDate(-1)}>
              <ChevronLeft size={16} />
            </button>
            <CalendarDays size={17} />
            <input
              aria-label="Дата продаж"
              type="date"
              value={date}
              max={today()}
              required
              onChange={(e) => {
                if (e.target.value && e.target.value <= today()) setDate(e.target.value);
              }}
            />
            <button aria-label="Следующий день" disabled={date >= today()} onClick={() => changeDate(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </PageHeading>
      <section className="metrics staff-metrics">
        <Metric
          label="Порции из меню"
          value={`${count} порц.`}
          hint="За выбранный день"
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
      {staffData.archivedBefore && date < staffData.archivedBefore && (
        <p className="form-warning">История за этот день очищена администратором.</p>
      )}
      <div className="sales-layout">
        <section className="catalog">
          <div className="section-title">
            <div>
              <h2>Записать продажу</h2>
              <p>Выберите позицию и укажите количество</p>
            </div>
          </div>
          <div className="catalog-tools sales-catalog-tools">
            <div className="menu-categories">
              {[['all', 'Всё'], ...categories.map((c) => [c.id, c.label]), ['alcohol', 'В розлив']].map(
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
                    {name}
                  </button>
                ),
              )}
            </div>
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Поиск напитка"
                placeholder="Найти напиток…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisible(24);
                }}
              />
            </label>
          </div>
          <div className="drink-grid">
            {products.slice(0, visible).map((p) => (
              <button
                className="drink-card"
                key={`${p.kind}:${p.id}`}
                onClick={() => {
                  setSelected(p);
                  setQuantity(p.kind === 'cocktail' ? '1' : '50');
                }}
              >
                <div className="card-image">
                  <CocktailArt
                    image={
                      p.kind === 'cocktail'
                        ? menuImage({
                            name: p.name,
                            image: p.image || 0,
                            category: p.category === 'alcohol' ? undefined : p.category,
                          })
                        : 60
                    }
                    name={p.name}
                  />
                  <span className="card-badge">
                    {p.category === 'alcohol' ? 'В РОЗЛИВ' : categoryLabel(p.category).toLocaleUpperCase()}
                  </span>
                </div>
                <div className="card-content">
                  <h3>{p.name}</h3>
                  <p>
                    {!p.ready
                      ? 'Попросите администратора настроить позицию'
                      : p.available === null
                        ? 'Доступно к продаже'
                        : `Доступно: ${label(p.available, p)}`}
                  </p>
                  <div className="card-bottom">
                    <span className={`stock-pill ${p.ready && p.available !== 0 ? '' : 'low'}`}>
                      {p.ready && p.available !== 0 ? 'Записать продажу' : 'Недоступно'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {products.length > visible && (
            <button className="button secondary load-more" onClick={() => setVisible(visible + 24)}>
              Показать ещё · {products.length - visible}
            </button>
          )}
          {!products.length && <Empty title="Позиции не найдены" text="Измените поиск или категорию." />}
        </section>
        <aside className="day-receipt">
          <div className="receipt-heading">
            <GlassWater size={20} />
            <div>
              <h2>Продано по позициям</h2>
              <p>{date}</p>
            </div>
            <span className="count-badge">{sales.length}</span>
          </div>
          <div className="receipt-lines">
            {[...summary.entries()].map(([key, item]) => (
              <div className="receipt-line" key={key}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{label(item.quantity, item)}</small>
                </div>
              </div>
            ))}
            {!sales.length && <Empty title="Продаж пока нет" text="За выбранный день нет активных продаж." />}
          </div>
          <div className="receipt-heading">
            <h2>Записи за день</h2>
          </div>
          <div className="receipt-lines">
            {[...day].reverse().map((sale) => (
              <div className={`receipt-line ${sale.voided ? 'voided' : ''}`} key={sale.id}>
                <div>
                  <strong>{sale.name}</strong>
                  <small>
                    {label(sale.quantity, sale)}
                    {sale.voided ? ' · отменена' : ''}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="receipt-note">Для исправления или отмены обратитесь к администратору.</div>
        </aside>
      </div>
      {creating && <StaffCocktailForm close={() => setCreating(false)} />}
      {selected && (
        <Modal title={selected.name} subtitle={`Продажа за ${date}`} close={() => setSelected(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  {
                    type: 'sale',
                    value: { kind: selected.kind, productId: selected.id, quantity: amount, date },
                  },
                  'Продажа записана.',
                )
              )
                setSelected(null);
            }}
          >
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
              {(selected.kind === 'cocktail' ? [1, 2, 3, 5] : [30, 50, 100, 150, 500]).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={amount === n ? 'selected' : ''}
                  onClick={() => setQuantity(String(n))}
                >
                  {n}
                  {selected.kind === 'alcohol' ? ' мл' : ''}
                </button>
              ))}
            </div>
            {!current?.ready && (
              <p className="form-warning">Попросите администратора настроить эту позицию.</p>
            )}
            {current?.available !== null && current && (
              <p className="form-help">Доступно: {label(current.available, current)}</p>
            )}
            <Submit
              disabled={
                !current?.ready ||
                amount <= 0 ||
                !Number.isFinite(amount) ||
                (current.available !== null && current.available < amount) ||
                (current.kind === 'cocktail' && !Number.isInteger(amount)) ||
                (!!staffData.archivedBefore && date < staffData.archivedBefore)
              }
            >
              Записать продажу
            </Submit>
          </form>
        </Modal>
      )}
    </>
  );
}

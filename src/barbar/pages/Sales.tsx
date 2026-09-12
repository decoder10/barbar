import { useState } from 'react';
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
import { Link } from 'react-router-dom';
import {
  activeSales,
  averageCost,
  categories,
  ingredientVolume,
  money,
  portions,
  recipeCost,
  round,
  stock,
  today,
  volume,
} from '../model';
import {
  AlcoholCard,
  CocktailCard,
  Empty,
  ExportButton,
  Field,
  Metric,
  Modal,
  PageHeading,
  Submit,
} from '../components';
import { useBar } from '../store';
import type { Alcohol, Cocktail, Sale } from '../types';

function SaleForm({
  kind,
  product,
  date,
  close,
}: {
  kind: Sale['kind'];
  product: Alcohol | Cocktail;
  date: string;
  close: () => void;
}) {
  const { data, run } = useBar();
  const [quantity, setQuantity] = useState(kind === 'cocktail' ? '1' : '50');
  const cocktail = product as Cocktail;
  const alcohol = product as Alcohol;
  const amount = Number(quantity);
  const price = kind === 'cocktail' ? cocktail.price : alcohol.pricePerLiter / 1000;
  const cost =
    kind === 'cocktail'
      ? recipeCost(data, cocktail.ingredients, cocktail.extraCosts)
      : averageCost(data, product.id) / 1000;
  const recipe = kind === 'cocktail' ? cocktail.ingredients : [{ alcoholId: product.id, ml: 1 }];
  const hasRecipe = recipe.length > 0 || (kind === 'cocktail' && !!cocktail.extraCosts?.length);
  const untracked = kind === 'cocktail' && !recipe.length && !!cocktail.extraCosts?.length;
  const available = untracked
    ? Infinity
    : kind === 'cocktail'
      ? portions(data, recipe)
      : stock(data, product.id);
  return (
    <Modal
      title={product.name}
      subtitle={`Продажа за ${new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU')}`}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              { type: 'sale', value: { kind, productId: product.id, quantity: amount, date } },
              'Продажа записана. Остатки обновлены.',
            )
          ) {
            close();
          }
        }}
      >
        <Field
          label={kind === 'cocktail' ? 'Количество порций' : 'Объём продажи, мл'}
          hint={
            untracked
              ? 'Продукты учитываются по стоимости, без контроля количества'
              : `Сейчас доступно: ${kind === 'cocktail' ? `${available} порций` : volume(available)}`
          }
        >
          <input
            type="number"
            min={kind === 'cocktail' ? 1 : 0.01}
            step={kind === 'cocktail' ? 1 : 0.01}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <div className="quick-values">
          {(kind === 'cocktail' ? [1, 2, 3, 5] : [30, 50, 100, 150, 500]).map((n) => (
            <button
              className={amount === n ? 'selected' : ''}
              type="button"
              key={n}
              onClick={() => setQuantity(String(n))}
            >
              {n}
              {kind === 'alcohol' ? ' мл' : ''}
            </button>
          ))}
        </div>
        <div className="recipe-breakdown">
          <div className="eyebrow">СПИШЕТСЯ СО СКЛАДА</div>
          {recipe.map((i) => (
            <div key={i.alcoholId}>
              <span>{data.alcohol.find((a) => a.id === i.alcoholId)?.name}</span>
              <b>{ingredientVolume(data, i.alcoholId, round(i.ml * (amount || 0)))}</b>
            </div>
          ))}
        </div>
        {kind === 'cocktail' && !!cocktail.extraCosts?.length && (
          <div className="recipe-breakdown">
            <div className="eyebrow">ПРОДУКТЫ ПО СТОИМОСТИ · БЕЗ СПИСАНИЯ КОЛИЧЕСТВА</div>
            {cocktail.extraCosts.map((i) => (
              <div key={i.alcoholId}>
                <span>{data.alcohol.find((a) => a.id === i.alcoholId)?.name}</span>
                <b>{money(round(i.cost * (amount || 0)))}</b>
              </div>
            ))}
          </div>
        )}
        <div className="form-total">
          <span>
            К оплате<strong>{money(round(price * (amount || 0)))}</strong>
          </span>
          <small>Себестоимость: {money(round(cost * (amount || 0)))}</small>
        </div>
        {!price && (
          <p className="form-warning">
            Сначала задайте цену в разделе «{kind === 'cocktail' ? 'Меню и рецепты' : 'Склад'}».
          </p>
        )}
        {kind === 'cocktail' && !hasRecipe && (
          <Link className="button secondary full" to={`/cocktails?edit=${product.id}`}>
            Добавить состав в редакторе
          </Link>
        )}
        <Submit disabled={!price || !hasRecipe || available < amount || amount <= 0}>Записать продажу</Submit>
        {available < amount && (
          <p className="form-warning">Недостаточно ингредиентов. Добавьте закупку на складе.</p>
        )}
      </form>
    </Modal>
  );
}
export default function Sales() {
  const { data, run, busy } = useBar();
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState('cocktail');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(24);
  const [selected, setSelected] = useState<{ kind: Sale['kind']; product: Alcohol | Cocktail } | null>(null);
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const sales = activeSales(data).filter((s) => s.date === date);
  const allDaySales = data.sales.filter((s) => s.date === date);
  const revenue = round(sales.reduce((n, s) => n + s.revenue, 0));
  const cost = round(sales.reduce((n, s) => n + s.cost, 0));
  const count = sales.filter((s) => s.kind === 'cocktail').reduce((n, s) => n + s.quantity, 0);
  const ml = sales.filter((s) => s.kind === 'alcohol').reduce((n, s) => n + s.quantity, 0);
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
  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
  function changeDate(offset: number) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    const value = next.toISOString().slice(0, 10);
    if (value <= today()) {
      setDate(value);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ВАШ БАР ПОД КОНТРОЛЕМ"
        title="Хороший день для хороших напитков."
        description="Каждая порция на своём месте. Каждая продажа на счету."
      >
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
              if (e.target.value && e.target.value <= today()) {
                setDate(e.target.value);
              }
            }}
          />
          <button aria-label="Следующий день" disabled={date >= today()} onClick={() => changeDate(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </PageHeading>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <span /> BARBAR CAFE · DAILY BAR
          </span>
          <h2>
            Смешивайте вкусы.
            <br />
            <em>Мы посчитаем остальное.</em>
          </h2>
          <p>
            От первой закупки до последнего коктейля —<br />
            весь бар в одном пространстве.
          </p>
          <Link className="hero-link" to="/cocktails">
            Открыть коктейльную карту <ArrowUpRight size={17} />
          </Link>
        </div>
        <span className="hero-seal">
          MADE WITH
          <br />
          <b>
            good
            <br />
            spirits
          </b>
          <span>BARBAR CAFE</span>
        </span>
      </section>
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
          label="Порции из меню"
          value={`${count} порц.`}
          hint="Все блюда и напитки порциями"
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
              <h2>Что наливаем?</h2>
              <p>Выберите напиток, чтобы записать продажу</p>
            </div>
            <Link className="text-link" to="/cocktails">
              <Plus size={15} /> Коктейль
            </Link>
          </div>
          <div className="catalog-tools sales-catalog-tools">
            <div className="menu-categories">
              {[['all', 'Всё'], ...categories.map((c) => [c.id, c.label]), ['alcohol', 'В розлив']].map(
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
                    {label}
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
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="drink-grid">
            {cocktails.slice(0, visible).map((c) => (
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
                    className={`stock-pill ${portions(data, c.ingredients) || (!c.ingredients.length && c.extraCosts?.length) ? '' : 'low'}`}
                  >
                    {!c.ingredients.length && c.extraCosts?.length
                      ? 'По стоимости'
                      : portions(data, c.ingredients)
                        ? `${portions(data, c.ingredients)} порц.`
                        : c.ingredients.length || c.extraCosts?.length
                          ? 'Нет запаса'
                          : 'Нет состава'}
                  </span>
                }
                action={() => setSelected({ kind: 'cocktail', product: c })}
              />
            ))}
            {alcohol.map((a) => (
              <AlcoholCard
                key={a.id}
                drink={a}
                ml={stock(data, a.id)}
                action={() => setSelected({ kind: 'alcohol', product: a })}
              />
            ))}
          </div>
          {cocktails.length > visible && (
            <button className="button secondary load-more" onClick={() => setVisible(visible + 24)}>
              Показать ещё · {cocktails.length - visible}
            </button>
          )}
          {!cocktails.length && !alcohol.length && (
            <Empty title="Напитки не найдены" text="Попробуйте другое название или измените фильтр." />
          )}
        </section>
        <aside className="day-receipt">
          <div className="receipt-heading">
            <span className="receipt-icon">
              <ReceiptText size={20} />
            </span>
            <div>
              <h2>Продажи за день</h2>
              <p>{dayLabel}</p>
            </div>
            <span className="count-badge">{sales.length}</span>
          </div>
          <div className="receipt-lines">
            {!allDaySales.length ? (
              <Empty title="День только начинается" text="Добавьте первую продажу — она появится здесь." />
            ) : (
              [...allDaySales].reverse().map((s) => (
                <div className={`receipt-line ${s.voided ? 'voided' : ''}`} key={s.id}>
                  <span className="receipt-drink">
                    <GlassWater size={18} />
                  </span>
                  <div>
                    <strong>{s.name}</strong>
                    <small>
                      {s.kind === 'cocktail' ? `${s.quantity} порц.` : volume(s.quantity)}
                      {s.voided ? ' · отменена' : ''}
                    </small>
                  </div>
                  <b>{money(s.revenue)}</b>
                  {!s.voided && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      onClick={() => setVoiding(s)}
                      aria-label={`Отменить продажу ${s.name}`}
                    >
                      <Undo2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="receipt-total">
            <span>
              Итого за день<strong>{money(revenue)}</strong>
            </span>
            <small>
              <ShoppingBag size={14} /> {sales.length} операций · {count} порций
            </small>
          </div>
          <ExportButton name={`sales-${date}.json`} value={allDaySales}>
            Скачать день
          </ExportButton>
          <div className="receipt-note">
            <span /> Остатки списываются автоматически
          </div>
        </aside>
      </div>
      {selected && <SaleForm {...selected} date={date} close={() => setSelected(null)} />}
      {voiding && (
        <Modal
          title="Отменить продажу?"
          subtitle={`${voiding.name} · ${money(voiding.revenue)}`}
          close={() => setVoiding(null)}
        >
          <p className="modal-text">
            Ингредиенты вернутся на склад. Запись останется в истории с отметкой об отмене и не будет
            учитываться в выручке.
          </p>
          <button
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
            Подтвердить отмену
          </button>
        </Modal>
      )}
    </>
  );
}

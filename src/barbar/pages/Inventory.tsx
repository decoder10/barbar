import { useState } from 'react';
import {
  ArrowDownToLine,
  Boxes,
  CircleDollarSign,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import {
  averageCost,
  ingredientUnit,
  ingredientVolume,
  money,
  round,
  stock,
  today,
  uid,
  volume,
} from '../model';
import { BottleArt, Empty, ExportButton, Field, Metric, Modal, PageHeading, Submit } from '../components';
import { useBar } from '../store';
import type { Alcohol } from '../types';

function AlcoholForm({ alcohol, close }: { alcohol?: Alcohol; close: () => void }) {
  const { data, run } = useBar();
  const [value, setValue] = useState<Alcohol>(
    alcohol || {
      id: uid(),
      name: '',
      category: 'alcohol',
      unit: 'ml',
      costPerLiter: 0,
      pricePerLiter: 0,
      color: '#8c775b',
    },
  );
  return (
    <Modal
      title={alcohol ? 'Настройки напитка' : 'Новый напиток'}
      subtitle="Закупочная и продажная цены указываются за 1 000 мл."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ type: 'alcohol', value }, 'Напиток сохранён в справочнике.')) {
            close();
          }
        }}
      >
        <Field label="Название">
          <input
            required
            maxLength={80}
            placeholder="Например, Абсент"
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label="Тип">
          <select
            value={value.category}
            onChange={(e) =>
              setValue({
                ...value,
                category: e.target.value as Alcohol['category'],
                unit: e.target.value === 'alcohol' ? 'ml' : value.unit,
              })
            }
          >
            <option value="alcohol">Алкоголь</option>
            <option value="mixer">Безалкогольный ингредиент / миксер</option>
          </select>
        </Field>
        <Field label="Единица измерения">
          <select
            disabled={
              value.category === 'alcohol' ||
              (!!alcohol && data.purchases.some((p) => p.alcoholId === alcohol.id))
            }
            value={value.unit || 'ml'}
            onChange={(e) => setValue({ ...value, unit: e.target.value as 'ml' | 'g' })}
          >
            <option value="ml">Миллилитры (жидкости)</option>
            <option value="g">Граммы (фрукты, сахар, специи)</option>
          </select>
        </Field>
        <div className="form-grid">
          <Field label={`Закупка за 1 000 ${value.unit === 'g' ? 'г' : 'мл'}, ֏`}>
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              value={value.costPerLiter}
              placeholder="0"
              onChange={(e) => setValue({ ...value, costPerLiter: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Продажа за 1 000 ${value.unit === 'g' ? 'г' : 'мл'}, ֏`}>
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              value={value.pricePerLiter}
              placeholder="0"
              onChange={(e) => setValue({ ...value, pricePerLiter: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Цвет бутылки">
          <input
            type="color"
            value={value.color}
            onChange={(e) => setValue({ ...value, color: e.target.value })}
          />
        </Field>
        <p className="form-help">
          Создание напитка не пополняет склад. После сохранения добавьте закупку. Новые цены не изменяют
          прошлые продажи.
        </p>
        <Submit />
      </form>
    </Modal>
  );
}
export function PurchaseForm({ alcoholId, close }: { alcoholId?: string; close: () => void }) {
  const { data, run } = useBar();
  const selected = data.alcohol.find((a) => a.id === alcoholId) || data.alcohol[0];
  const [id] = useState(uid);
  const [drinkId, setDrinkId] = useState(selected?.id || '');
  const [ml, setMl] = useState('1000');
  const [cost, setCost] = useState(String(selected?.costPerLiter || ''));
  const [date, setDate] = useState(today);
  return (
    <Modal title="Добавить закупку" subtitle="Объём прибавится к текущему остатку напитка." close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              {
                type: 'purchase',
                value: { id, alcoholId: drinkId, ml: Number(ml), costPerLiter: Number(cost), date },
              },
              'Закупка добавлена. Склад пополнен.',
            )
          ) {
            close();
          }
        }}
      >
        <Field label="Напиток">
          <select
            required
            value={drinkId}
            onChange={(e) => {
              setDrinkId(e.target.value);
              setCost(String(data.alcohol.find((a) => a.id === e.target.value)?.costPerLiter || ''));
            }}
          >
            {data.alcohol.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label={`Количество, ${ingredientUnit(data, drinkId)}`}>
            <input
              required
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              value={ml}
              onChange={(e) => setMl(e.target.value)}
            />
          </Field>
          <Field label={`Цена за 1 000 ${ingredientUnit(data, drinkId)}, ֏`}>
            <input
              required
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              value={cost}
              placeholder="Закупочная цена"
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
        </div>
        <div className="quick-values">
          {[500, 700, 1000, 2000, 5000].map((n) => (
            <button
              type="button"
              key={n}
              className={Number(ml) === n ? 'selected' : ''}
              onClick={() => setMl(String(n))}
            >
              {n} {ingredientUnit(data, drinkId)}
            </button>
          ))}
        </div>
        <Field label="Дата закупки">
          <input required type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="form-total">
          <span>
            Стоимость закупки<strong>{money(round((Number(ml) * Number(cost)) / 1000))}</strong>
          </span>
          <small>
            На складе станет: {ingredientVolume(data, drinkId, stock(data, drinkId) + Number(ml))}
          </small>
        </div>
        <Submit>Добавить на склад</Submit>
      </form>
    </Modal>
  );
}
function ResetStockForm({ alcohol, close }: { alcohol: Alcohol; close: () => void }) {
  const { data, run, busy } = useBar();
  const [confirmation, setConfirmation] = useState('');
  const [amount] = useState(() => stock(data, alcohol.id));
  const [cost] = useState(() => round((averageCost(data, alcohol.id) * amount) / 1000));
  return (
    <Modal
      title={`Обнулить остаток «${alcohol.name}»?`}
      subtitle="Это спишет весь текущий запас выбранного напитка."
      close={close}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (confirmation.trim().toLocaleUpperCase('ru-RU') !== 'СБРОС') return;
          if (
            await run(
              { type: 'resetStock', alcoholId: alcohol.id, expectedMl: amount, expectedCost: cost },
              `Остаток «${alcohol.name}» обнулён. Списание сохранено.`,
            )
          )
            close();
        }}
      >
        <div className="form-total">
          <span>
            Остаток после сброса
            <strong>
              {ingredientVolume(data, alcohol.id, amount)} → {ingredientVolume(data, alcohol.id, 0)}
            </strong>
          </span>
          <small>Стоимость списания: {money(cost)}</small>
        </div>
        <p className="form-help">
          Вы подтверждаете, что этого запаса больше нет на складе. Напиток, его цены, рецепты, закупки и
          прошлые продажи сохранятся. Другие напитки не изменятся. Сброс увидят все устройства. Чтобы снова
          пополнить запас, добавьте новую закупку.
        </p>
        <Field
          label="Для подтверждения напишите СБРОС"
          hint="Передумали? Нажмите «Отмена» — ничего не изменится."
        >
          <input autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </Field>
        <div className="reset-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={close}>
            Отмена
          </button>
          <button
            type="submit"
            className="button danger-button"
            disabled={busy || confirmation.trim().toLocaleUpperCase('ru-RU') !== 'СБРОС'}
          >
            {busy ? 'Списываем…' : 'Да, обнулить остаток'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function Inventory() {
  const { data } = useBar();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [edit, setEdit] = useState<Alcohol | 'new' | null>(null);
  const [purchase, setPurchase] = useState<string | null>(null);
  const [reset, setReset] = useState<Alcohol | null>(null);
  const filtered = data.alcohol.filter(
    (a) =>
      a.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (category === 'all' || a.category === category),
  );
  const totalMl = data.alcohol.filter((a) => a.unit !== 'g').reduce((n, a) => n + stock(data, a.id), 0);
  const worth = data.alcohol.reduce((n, a) => n + (stock(data, a.id) * averageCost(data, a.id)) / 1000, 0);
  const shortages = new Map<string, { id: string; name: string; required: number; missing: number }[]>();
  for (const recipe of data.cocktails) {
    for (const ingredient of recipe.ingredients) {
      const missing = round(ingredient.ml - stock(data, ingredient.alcoholId));
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
        title="Склад напитков"
        description="Закупки складываются. Продажи списываются. Остатки всегда перед глазами."
      >
        <button className="button secondary" onClick={() => setEdit('new')}>
          <Plus size={17} /> Новый напиток
        </button>
        <button className="button primary" onClick={() => setPurchase('')}>
          <PackagePlus size={17} /> Добавить закупку
        </button>
      </PageHeading>
      <section className="metrics">
        <Metric
          label="Напитков в каталоге"
          value={String(data.alcohol.length)}
          hint="Алкоголь и миксеры"
          icon={<Boxes size={18} />}
          accent
        />
        <Metric
          label="Общий остаток"
          value={volume(totalMl)}
          hint="Остатки жидкостей · твёрдые в граммах"
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
            <h2>Ваш барный запас</h2>
            <p>Красным выделены ингредиенты, которых не хватает на одну порцию по сохранённым рецептам.</p>
          </div>
          <ExportButton name="alcohol.json" value={data.alcohol} />
        </div>
        <div className="catalog-tools">
          <div className="segmented">
            {[
              ['all', 'Все'],
              ['alcohol', 'Алкоголь'],
              ['mixer', 'Миксеры'],
            ].map(([id, label]) => (
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
              placeholder="Найти на полке…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <p className="inventory-recipe-help">
          Позиции без состава не проверяются. Добавьте ингредиенты в разделе «Меню и рецепты».
        </p>
        <div className="table-scroll">
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>Напиток</th>
                <th>Остаток</th>
                <th>Ср. закупка / л или кг</th>
                <th>Продажа / л или кг</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className={shortages.has(a.id) ? 'inventory-shortage' : undefined}>
                  <td>
                    <div className="table-product">
                      <BottleArt drink={a} />
                      <span>
                        <strong>{a.name}</strong>
                        <small>{a.category === 'mixer' ? 'Миксер' : 'Алкоголь'}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`stock-pill ${shortages.has(a.id) ? 'low' : ''}`}>
                      {ingredientVolume(data, a.id, stock(data, a.id))}
                    </span>
                    {shortages.has(a.id) && (
                      <details className="inventory-shortage-details">
                        <summary>
                          <TriangleAlert size={13} aria-hidden="true" /> Не хватает для рецептов:{' '}
                          {shortages.get(a.id)!.length}
                        </summary>
                        <ul>
                          {shortages.get(a.id)!.map((recipe) => (
                            <li key={recipe.id}>
                              <strong>{recipe.name}</strong>
                              <span>
                                На порцию нужно {ingredientVolume(data, a.id, recipe.required)}; не хватает{' '}
                                {ingredientVolume(data, a.id, recipe.missing)}.
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td>{money(round(averageCost(data, a.id)))}</td>
                  <td>
                    {a.pricePerLiter ? money(a.pricePerLiter) : <span className="muted">Не задана</span>}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="button small secondary" onClick={() => setPurchase(a.id)}>
                        <Plus size={14} /> Закупка
                      </button>
                      <button
                        className="button small secondary"
                        aria-label={`Сбросить остаток ${a.name}`}
                        disabled={stock(data, a.id) <= 0}
                        onClick={() => setReset(a)}
                      >
                        <RotateCcw size={14} /> Сброс
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Изменить ${a.name}`}
                        onClick={() => setEdit(a)}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty title="На этой полке пока пусто" text="Добавьте напиток или измените поисковый запрос." />
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>История закупок</h2>
            <p>Каждая поставка сохраняется отдельной записью</p>
          </div>
          <ExportButton name="purchases.json" value={data.purchases} />
        </div>
        {data.purchases.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Напиток</th>
                  <th>Объём</th>
                  <th>Цена / л или кг</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {[...data.purchases]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(`${p.date}T12:00:00`).toLocaleDateString('ru-RU')}</td>
                      <td>{data.alcohol.find((a) => a.id === p.alcoholId)?.name}</td>
                      <td>{ingredientVolume(data, p.alcoholId, p.ml)}</td>
                      <td>{money(p.costPerLiter)}</td>
                      <td>
                        <strong>{money(round((p.ml * p.costPerLiter) / 1000))}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Начните с первой закупки"
            text="Купили 1 000 мл, потом ещё 1 000 мл — на складе будет 2 000 мл."
          />
        )}
      </section>
      {!!data.stockResets?.length && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>История сбросов</h2>
              <p>Списания запасов при обнулении остатков</p>
            </div>
            <ExportButton name="stock-resets.json" value={data.stockResets} />
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Напиток</th>
                  <th>Списано</th>
                  <th>Стоимость списания</th>
                </tr>
              </thead>
              <tbody>
                {[...data.stockResets].reverse().map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString('ru-RU', { timeZone: 'Asia/Yerevan' })}</td>
                    <td>{r.name}</td>
                    <td>{ingredientVolume(data, r.alcoholId, r.ml)}</td>
                    <td>{money(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {reset && <ResetStockForm alcohol={reset} close={() => setReset(null)} />}
      {edit && <AlcoholForm alcohol={edit === 'new' ? undefined : edit} close={() => setEdit(null)} />}
      {purchase !== null && (
        <PurchaseForm alcoholId={purchase || undefined} close={() => setPurchase(null)} />
      )}
    </>
  );
}

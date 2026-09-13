import alcoholDefaults from './data/alcohol.json' with { type: 'json' };
import cocktailDefaults from './data/cocktails.json' with { type: 'json' };
import { maxMenuImage } from './images';
import salesDefaults from './data/sales/initial.json' with { type: 'json' };
import { Alcohol, BarData, Cocktail, Command, Ingredient, MenuCategory, Sale, PortionExpense } from './types';

export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yerevan' }).format(new Date());
export const money = (n: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)} ֏`;
export const volume = (n: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)} мл`;
export const uid = () => crypto.randomUUID();
export const categories: { id: MenuCategory; label: string }[] = [
  { id: 'cocktail', label: 'Коктейли' },
  { id: 'tincture', label: 'Настойки' },
  { id: 'shot', label: 'Шоты' },
  { id: 'set', label: 'Сеты' },
  { id: 'beer', label: 'Пиво' },
  { id: 'wine', label: 'Вино' },
  { id: 'cognac', label: 'Коньяк' },
  { id: 'hot', label: 'Горячие напитки' },
  { id: 'soft', label: 'Безалкогольные' },
  { id: 'snack', label: 'Закуски' },
];
export const categoryLabel = (category?: MenuCategory) =>
  categories.find((c) => c.id === (category || 'cocktail'))?.label || 'Коктейли';
export const unitLabel = (unit?: Alcohol['unit']) => (unit === 'bottle' ? 'бут.' : unit === 'g' ? 'г' : 'мл');
export const ingredientUnit = (data: BarData, id: string) =>
  unitLabel(data.alcohol.find((a) => a.id === id)?.unit);
export const priceBasis = (data: BarData, id: string) =>
  data.alcohol.find((a) => a.id === id)?.unit === 'bottle' ? 1 : 1000;
export const priceUnit = (unit?: Alcohol['unit']) =>
  unit === 'bottle' ? '1 бутылку' : `1 000 ${unitLabel(unit)}`;
const amountValid = (data: BarData, id: string, amount: unknown, positive = true) =>
  number(amount, positive) && (priceBasis(data, id) !== 1 || Number.isInteger(amount));
export const ingredientVolume = (data: BarData, id: string, amount: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ${ingredientUnit(data, id)}`;
export const saleUnit = (sale: { kind: string; unit?: 'bottle' | 'glass'; category?: MenuCategory }) =>
  sale.unit === 'bottle'
    ? 'бут.'
    : sale.unit === 'glass'
      ? sale.category === 'wine'
        ? 'бок.'
        : 'порц.'
      : sale.kind === 'cocktail'
        ? 'порц.'
        : 'мл';
export const quantityRound = (data: BarData, id: string, n: number) =>
  priceBasis(data, id) === 1 ? (Math.abs(n) < 1e-7 ? 0 : Math.round(n * 1e8) / 1e8) : round(n);
const ingredientAmountValid = (data: BarData, id: string, n: unknown) =>
  data.alcohol.find((a) => a.id === id)?.category &&
  ['wine', 'cognac'].includes(data.alcohol.find((a) => a.id === id)!.category)
    ? typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1e9
    : amountValid(data, id, n);
const resets = (data: BarData) => data.stockResets || [];
const retired = (data: BarData) => data.archived?.ingredients || [];

const fail = (message: string): never => {
  throw new Error(message);
};
const number = (n: unknown, positive = false): n is number =>
  typeof n === 'number' &&
  Number.isFinite(n) &&
  n >= (positive ? 0.01 : 0) &&
  n <= 1e9 &&
  Math.abs(round(n) - n) < 0.000001;
const identifier = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
const nameValid = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 80;
const dateValid = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s &&
  s <= today();

export const initialData = (): BarData => ({
  version: 1,
  alcohol: alcoholDefaults as Alcohol[],
  cocktails: cocktailDefaults as Cocktail[],
  purchases: [],
  sales: salesDefaults,
  operations: [],
});
export const activeSales = (data: BarData) => data.sales.filter((s) => !s.voided);
export const stock = (data: BarData, id: string) =>
  quantityRound(
    data,
    id,
    data.purchases.filter((p) => p.alcoholId === id).reduce((n, p) => n + p.ml, 0) -
      activeSales(data).reduce(
        (n, s) => n + s.ingredients.filter((i) => i.alcoholId === id).reduce((sum, i) => sum + i.ml, 0),
        0,
      ) -
      [...retired(data), ...resets(data)].filter((i) => i.alcoholId === id).reduce((n, i) => n + i.ml, 0),
  );

// Historical purchase prices and sale costs remain immutable. The current average
// is the cost of remaining stock divided by remaining volume.
export const averageCost = (data: BarData, id: string) => {
  const remaining = stock(data, id);
  if (remaining <= 0) {
    return data.alcohol.find((a) => a.id === id)?.costPerLiter || 0;
  }
  const bought = data.purchases
    .filter((p) => p.alcoholId === id)
    .reduce((n, p) => n + (p.ml * p.costPerLiter) / priceBasis(data, id), 0);
  const used = activeSales(data).reduce(
    (n, s) => n + s.ingredients.filter((i) => i.alcoholId === id).reduce((sum, i) => sum + i.cost, 0),
    0,
  );
  return Math.max(
    0,
    ((bought -
      used -
      [...retired(data), ...resets(data)].filter((i) => i.alcoholId === id).reduce((n, i) => n + i.cost, 0)) /
      remaining) *
      priceBasis(data, id),
  );
};
export const recipeCost = (data: BarData, recipe: Ingredient[], extraCosts: PortionExpense[] = []) =>
  round(
    recipe.reduce((n, i) => n + (averageCost(data, i.alcoholId) * i.ml) / priceBasis(data, i.alcoholId), 0) +
      extraCosts.reduce((n, i) => n + i.cost, 0),
  );
export const recipeReady = (data: BarData, recipe: Ingredient[], extraCosts: PortionExpense[] = []) =>
  (recipe.length > 0 || extraCosts.length > 0) &&
  recipe.every((i) => averageCost(data, i.alcoholId) > 0) &&
  extraCosts.every((i) => i.cost > 0);
export const portions = (data: BarData, recipe: Ingredient[]) =>
  recipe.length
    ? Math.max(0, Math.floor(Math.min(...recipe.map((i) => (stock(data, i.alcoholId) + 1e-7) / i.ml))))
    : 0;

function ingredientsValid(value: Ingredient[], data: BarData, maximum = 30) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maximum &&
    new Set(value.map((i) => i.alcoholId)).size === value.length &&
    value.every(
      (i) =>
        i && data.alcohol.some((a) => a.id === i.alcoholId) && ingredientAmountValid(data, i.alcoholId, i.ml),
    )
  );
}
function alcoholValid(a: Alcohol) {
  return (
    a &&
    identifier(a.id) &&
    nameValid(a.name) &&
    ['alcohol', 'mixer', 'beer', 'wine', 'cognac'].includes(a.category) &&
    (a.unit === undefined || ['ml', 'g', 'bottle'].includes(a.unit)) &&
    (a.category !== 'alcohol' || !a.unit || a.unit === 'ml') &&
    (['beer', 'wine', 'cognac'].includes(a.category) ? a.unit === 'bottle' : a.unit !== 'bottle') &&
    (a.bottleSizeMl === undefined ||
      (Number.isInteger(a.bottleSizeMl) && a.bottleSizeMl > 0 && a.bottleSizeMl <= 10000)) &&
    (a.glassSizeMl === undefined ||
      (Number.isInteger(a.glassSizeMl) &&
        a.glassSizeMl > 0 &&
        !!a.bottleSizeMl &&
        a.glassSizeMl <= a.bottleSizeMl)) &&
    (a.glassPrice === undefined || number(a.glassPrice)) &&
    number(a.costPerLiter) &&
    number(a.pricePerLiter) &&
    /^#[a-fA-F0-9]{6}$/.test(a.color)
  );
}
function expensesValid(expenses: PortionExpense[] | undefined, data: BarData) {
  return (
    expenses === undefined ||
    (Array.isArray(expenses) &&
      expenses.length <= 30 &&
      new Set(expenses.map((i) => i?.alcoholId)).size === expenses.length &&
      expenses.every(
        (i) =>
          i &&
          number(i.cost, true) &&
          data.alcohol.some((a) => a.id === i.alcoholId && a.category === 'mixer'),
      ))
  );
}
function cocktailValid(c: Cocktail, data: BarData) {
  return (
    c &&
    identifier(c.id) &&
    (c.stockAlcoholId === undefined ||
      (['beer', 'wine', 'cognac'].includes(c.category || '') &&
        data.alcohol.some((a) => a.id === c.stockAlcoholId && a.category === c.category) &&
        c.ingredients?.length === 1 &&
        c.ingredients[0].alcoholId === c.stockAlcoholId &&
        (c.serving === 'glass'
          ? ['wine', 'cognac'].includes(c.category || '') &&
            c.ingredients[0].ml > 0 &&
            c.ingredients[0].ml <= 1
          : c.ingredients[0].ml === 1) &&
        !c.extraCosts?.length)) &&
    (c.serving === undefined || ['bottle', 'glass'].includes(c.serving)) &&
    nameValid(c.name) &&
    number(c.price) &&
    Number.isInteger(c.image) &&
    c.image >= 0 &&
    c.image <= maxMenuImage &&
    (c.category === undefined || categories.some((k) => k.id === c.category)) &&
    (c.notes === undefined || (typeof c.notes === 'string' && c.notes.length <= 1000)) &&
    expensesValid(c.extraCosts, data) &&
    !(c.extraCosts || []).some((e) => c.ingredients?.some((i) => i.alcoholId === e.alcoholId)) &&
    Array.isArray(c.ingredients) &&
    (c.ingredients.length === 0 || ingredientsValid(c.ingredients, data))
  );
}
function assertLedger(data: BarData) {
  const balances: Record<string, number> = {};
  const events = [
    ...data.purchases.map((p) => ({
      date: p.date,
      order: 0,
      ingredients: [{ alcoholId: p.alcoholId, ml: p.ml }],
    })),
    ...(data.archived
      ? [
          {
            date: data.archived.before,
            order: -1,
            ingredients: data.archived.ingredients.map((i) => ({ alcoholId: i.alcoholId, ml: -i.ml })),
          },
        ]
      : []),
    ...resets(data).map((r) => ({
      date: data.archived && r.date < data.archived.before ? data.archived.before : r.date,
      order: 2,
      ingredients: [{ alcoholId: r.alcoholId, ml: -r.ml }],
    })),
    ...activeSales(data).map((s) => ({
      date: s.date,
      order: 1,
      ingredients: s.ingredients.map((i) => ({ alcoholId: i.alcoholId, ml: -i.ml })),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  events.forEach((event) =>
    event.ingredients.forEach((i) => {
      balances[i.alcoholId] = quantityRound(data, i.alcoholId, (balances[i.alcoholId] || 0) + i.ml);
      if (balances[i.alcoholId] < (priceBasis(data, i.alcoholId) === 1 ? -1e-7 : -0.001)) {
        fail(
          `Недостаточно «${data.alcohol.find((a) => a.id === i.alcoholId)?.name}» на ${event.date}. Добавьте закупку или уменьшите количество.`,
        );
      }
    }),
  );
}

export function validateData(value: unknown): BarData {
  if (!value || typeof value !== 'object') {
    return fail('Некорректный файл резервной копии.');
  }
  const d = value as BarData;
  if (d.version !== 1 || ![d.alcohol, d.cocktails, d.purchases, d.sales, d.operations].every(Array.isArray)) {
    return fail('Формат резервной копии не поддерживается.');
  }
  if (
    [d.alcohol, d.cocktails, d.purchases, d.sales].some(
      (items) => new Set(items.map((i) => i.id)).size !== items.length,
    )
  ) {
    return fail('Повторяющиеся идентификаторы в файле.');
  }
  if (!d.alcohol.every(alcoholValid) || !d.cocktails.every((c) => cocktailValid(c, d))) {
    return fail('Проверьте названия, цены и рецепты в файле.');
  }
  if (
    !d.purchases.every(
      (p) =>
        identifier(p.id) &&
        d.alcohol.some((a) => a.id === p.alcoholId) &&
        dateValid(p.date) &&
        amountValid(d, p.alcoholId, p.ml) &&
        number(p.costPerLiter, true),
    )
  ) {
    return fail('Некорректные закупки в файле.');
  }
  if (
    !d.sales.every(
      (s) =>
        identifier(s.id) &&
        dateValid(s.date) &&
        typeof s.createdAt === 'string' &&
        Number.isFinite(Date.parse(s.createdAt)) &&
        ['cocktail', 'alcohol'].includes(s.kind) &&
        (s.kind === 'alcohol' ? d.alcohol : d.cocktails).some((p) => p.id === s.productId) &&
        nameValid(s.name) &&
        number(s.quantity, true) &&
        (s.kind !== 'cocktail' || Number.isInteger(s.quantity)) &&
        number(s.revenue, true) &&
        number(s.cost) &&
        (s.unit === undefined || ['bottle', 'glass'].includes(s.unit)) &&
        typeof s.voided === 'boolean' &&
        Array.isArray(s.ingredients) &&
        (s.ingredients.length > 0 ? ingredientsValid(s.ingredients, d) : !!s.extraCosts?.length) &&
        expensesValid(s.extraCosts, d) &&
        (s.extraCosts || []).every((i) => nameValid(i.name)) &&
        s.ingredients.every((i) => number(i.cost)) &&
        Math.abs(
          s.cost -
            round(
              s.ingredients.reduce((sum, i) => sum + i.cost, 0) +
                (s.extraCosts || []).reduce((sum, i) => sum + i.cost, 0),
            ),
        ) < 0.001,
    )
  ) {
    return fail('Некорректные продажи в файле.');
  }
  if (
    d.stockResets !== undefined &&
    (!Array.isArray(d.stockResets) ||
      new Set(d.stockResets.map((r) => r?.id)).size !== d.stockResets.length ||
      !d.stockResets.every(
        (r) =>
          r &&
          identifier(r.id) &&
          d.alcohol.some((a) => a.id === r.alcoholId) &&
          nameValid(r.name) &&
          dateValid(r.date) &&
          typeof r.createdAt === 'string' &&
          Number.isFinite(Date.parse(r.createdAt)) &&
          ingredientAmountValid(d, r.alcoholId, r.ml) &&
          number(r.cost),
      ))
  ) {
    return fail('Некорректные списания при сбросе склада.');
  }
  if (!d.operations.every(identifier)) {
    return fail('Некорректный журнал операций.');
  }
  if (
    d.archived &&
    (!dateValid(d.archived.before) ||
      !Number.isSafeInteger(d.archived.count) ||
      d.archived.count < 0 ||
      !Array.isArray(d.archived.ingredients) ||
      (d.archived.ingredients.length > 0 && !ingredientsValid(d.archived.ingredients, d, d.alcohol.length)) ||
      !d.archived.ingredients.every((i) => number(i.cost)) ||
      d.sales.some((s) => s.date < d.archived!.before))
  ) {
    return fail('Некорректный остаток после очистки истории.');
  }
  assertLedger(d);
  return d;
}

export function applyCommand(data: BarData, command: Command): BarData {
  if (!command || !identifier(command.id)) {
    return fail('Некорректная операция.');
  }
  if (
    data.operations.includes(command.id) ||
    data.sales.some((s) => s.id === command.id) ||
    resets(data).some((r) => r.id === command.id)
  ) {
    return data;
  }
  const next: BarData = JSON.parse(JSON.stringify(data));
  switch (command.type) {
    case 'alcohol': {
      const a = command.value;
      if (!alcoholValid(a)) {
        return fail('Заполните название, единицу измерения и корректные цены.');
      }
      if (
        next.alcohol.some(
          (item) =>
            item.id !== a.id && item.name.trim().toLocaleLowerCase() === a.name.trim().toLocaleLowerCase(),
        )
      ) {
        return fail('Напиток с таким названием уже есть.');
      }
      const index = next.alcohol.findIndex((item) => item.id === a.id);
      if (
        index >= 0 &&
        (next.alcohol[index].unit || 'ml') !== (a.unit || 'ml') &&
        (next.purchases.some((p) => p.alcoholId === a.id) ||
          next.cocktails.some((c) => c.ingredients.some((i) => i.alcoholId === a.id)))
      ) {
        return fail('Единицы измерения используемого ингредиента менять нельзя. Создайте новый ингредиент.');
      }
      if (
        index >= 0 &&
        !!next.alcohol[index].bottleSizeMl &&
        next.alcohol[index].bottleSizeMl !== a.bottleSizeMl &&
        next.purchases.some((p) => p.alcoholId === a.id)
      )
        return fail(
          'Объём закупленной бутылки менять нельзя. Для другого объёма создайте отдельную позицию.',
        );
      if (
        index >= 0 &&
        next.cocktails.some((c) => c.stockAlcoholId === a.id && c.serving === 'glass') &&
        (!a.glassSizeMl || !a.bottleSizeMl)
      )
        return fail('Укажите объём бутылки и бокала.');
      if (
        index >= 0 &&
        next.alcohol[index].category !== a.category &&
        next.cocktails.some((c) => c.stockAlcoholId === a.id)
      )
        return fail('Тип связанной с меню бутылки менять нельзя.');
      if (index < 0) {
        next.alcohol.push({ ...a, name: a.name.trim() });
      } else {
        next.alcohol[index] = { ...a, name: a.name.trim() };
      }
      if (['beer', 'wine', 'cognac'].includes(a.category)) {
        const linked = next.cocktails.find((c) => c.stockAlcoholId === a.id && c.serving !== 'glass');
        if (linked) {
          linked.name = a.category !== 'beer' ? `${a.name.trim()} · бутылка` : a.name.trim();
          linked.price = a.pricePerLiter;
        } else {
          const menuId = `bottle-${a.id}`;
          if (
            !identifier(menuId) ||
            next.cocktails.some(
              (c) =>
                c.id === menuId ||
                (c.category === a.category &&
                  c.name.trim().toLocaleLowerCase() === a.name.trim().toLocaleLowerCase()),
            )
          ) {
            return fail(
              'Такая марка уже есть в меню. Измените существующую позицию или укажите другое название.',
            );
          }
          next.cocktails.push({
            id: menuId,
            name: a.category !== 'beer' ? `${a.name.trim()} · бутылка` : a.name.trim(),
            category: a.category as MenuCategory,
            stockAlcoholId: a.id,
            ingredients: [{ alcoholId: a.id, ml: 1 }],
            price: a.pricePerLiter,
            image: a.category === 'wine' ? 10 : a.category === 'cognac' ? 60 : 7,
          });
        }
      }
      if (['wine', 'cognac'].includes(a.category) && a.glassSizeMl && a.bottleSizeMl) {
        const glassName = `${a.name.trim()} · ${a.category === 'wine' ? 'бокал' : 'порция'}`;
        let glass = next.cocktails.find((c) => c.stockAlcoholId === a.id && c.serving === 'glass');
        glass ||= next.cocktails.find(
          (c) =>
            c.category === a.category &&
            c.name === glassName &&
            !c.ingredients.length &&
            !c.extraCosts?.length &&
            !next.sales.some((s) => s.productId === c.id),
        );
        if (!glass) {
          const glassId = `glass-${a.id}`;
          if (!identifier(glassId) || next.cocktails.some((c) => c.id === glassId || c.name === glassName))
            return fail('Позиция вина в бокалах уже существует.');
          glass = {
            id: glassId,
            name: glassName,
            category: a.category as MenuCategory,
            price: a.glassPrice || 0,
            image: 10,
            ingredients: [],
          };
          next.cocktails.push(glass);
        }
        Object.assign(glass, {
          name: glassName,
          stockAlcoholId: a.id,
          serving: 'glass',
          price: a.glassPrice ?? glass.price,
          ingredients: [{ alcoholId: a.id, ml: a.glassSizeMl / a.bottleSizeMl }],
          notes: `${a.glassSizeMl} мл из бутылки ${a.bottleSizeMl} мл.`,
        });
      }
      const menuNames = next.cocktails.map(
        (c) => `${c.category || 'cocktail'}:${c.name.trim().toLocaleLowerCase()}`,
      );
      if (
        new Set(menuNames).size !== menuNames.length ||
        !next.cocktails.every((c) => cocktailValid(c, next))
      )
        return fail('Проверьте название марки, объёмы и связанные позиции меню.');
      break;
    }
    case 'createCocktail': {
      const c = command.value;
      if (
        !c ||
        !Array.isArray(c.ingredients) ||
        c.ingredients.length > 30 ||
        next.cocktails.some((item) => item.id === command.id)
      ) {
        return fail('Проверьте название и состав новой позиции.');
      }
      // Staff can create a recipe, but cannot set money fields or overwrite an existing item.
      // Pick every field explicitly, including nested ingredient fields.
      return applyCommand(data, {
        type: 'cocktail',
        id: command.id,
        value: {
          id: command.id,
          name: c.name,
          ...(c.category !== undefined ? { category: c.category } : {}),
          ...(c.notes !== undefined ? { notes: c.notes } : {}),
          image: c.image,
          price: 0,
          ingredients: c.ingredients.map((i) => ({ alcoholId: i?.alcoholId, ml: i?.ml })),
        },
      });
    }
    case 'cocktail': {
      const c = command.value;
      if (!cocktailValid(c, next)) {
        return fail('Укажите название, цену и ингредиенты без повторов.');
      }
      if (
        next.cocktails.some(
          (item) =>
            item.id !== c.id &&
            (item.category || 'cocktail') === (c.category || 'cocktail') &&
            item.name.trim().toLocaleLowerCase() === c.name.trim().toLocaleLowerCase(),
        )
      ) {
        return fail('Коктейль с таким названием уже есть.');
      }
      const index = next.cocktails.findIndex((item) => item.id === c.id);
      const previous = next.cocktails[index];
      if (previous?.stockAlcoholId && previous.stockAlcoholId !== c.stockAlcoholId)
        return fail('Связь бутылки со складом нельзя удалить.');
      if (
        c.stockAlcoholId &&
        previous &&
        (previous.serving !== c.serving ||
          JSON.stringify(previous.ingredients) !== JSON.stringify(c.ingredients) ||
          previous.category !== c.category)
      )
        return fail('Объём и состав бутылки изменяются в разделе «Склад».');
      if (c.stockAlcoholId) {
        const beer = next.alcohol.find((a) => a.id === c.stockAlcoholId)!;
        if (
          next.alcohol.some(
            (a) =>
              a.id !== beer.id && a.name.trim().toLocaleLowerCase() === c.name.trim().toLocaleLowerCase(),
          )
        )
          return fail('Такая марка уже есть на складе.');
        if (c.name !== previous?.name) return fail('Измените марку бутылки в разделе «Склад».');
        if (c.serving === 'glass') beer.glassPrice = c.price;
        else beer.pricePerLiter = c.price;
      }
      if (index < 0) {
        next.cocktails.push({ ...c, name: c.name.trim() });
      } else {
        next.cocktails[index] = { ...c, name: c.name.trim() };
      }
      break;
    }
    case 'purchase': {
      const p = command.value;
      if (next.archived && p?.date < next.archived.before) {
        return fail('Этот период уже очищен. Закупки в нём закрыты.');
      }
      if (
        !p ||
        !identifier(p.id) ||
        next.purchases.some((item) => item.id === p.id) ||
        !next.alcohol.some((a) => a.id === p.alcoholId) ||
        !dateValid(p.date) ||
        !amountValid(next, p.alcoholId, p.ml) ||
        !number(p.costPerLiter, true)
      ) {
        return fail('Проверьте дату, объём и закупочную цену.');
      }
      next.purchases.push(p);
      next.alcohol = next.alcohol.map((a) =>
        a.id === p.alcoholId ? { ...a, costPerLiter: p.costPerLiter } : a,
      );
      break;
    }
    case 'correctPurchase': {
      const index = next.purchases.findIndex((p) => p.id === command.purchaseId);
      const purchase = next.purchases[index];
      if (
        !purchase ||
        !amountValid(next, purchase.alcoholId, command.ml, false) ||
        !number(command.expectedMl, true)
      ) {
        return fail('Проверьте закупку и новое количество.');
      }
      if (next.archived && purchase.date < next.archived.before) {
        return fail('Период уже очищен. Закупки этого периода нельзя исправлять.');
      }
      if (purchase.ml !== command.expectedMl) {
        return fail('Закупка уже изменена. Обновите склад и откройте её заново.');
      }
      if (command.ml === 0) next.purchases.splice(index, 1);
      else next.purchases[index] = { ...purchase, ml: command.ml };
      try {
        assertLedger(next);
      } catch {
        return fail(
          'Нельзя уменьшить закупку: часть количества уже использована в продажах или списаниях. Сначала исправьте связанные операции.',
        );
      }
      const bought = next.purchases
        .filter((p) => p.alcoholId === purchase.alcoholId)
        .reduce((n, p) => n + (p.ml * p.costPerLiter) / priceBasis(next, p.alcoholId), 0);
      const used = [...activeSales(next).flatMap((s) => s.ingredients), ...retired(next), ...resets(next)]
        .filter((i) => i.alcoholId === purchase.alcoholId)
        .reduce((n, i) => n + i.cost, 0);
      if (
        bought - used < -0.01 ||
        (stock(next, purchase.alcoholId) === 0 && Math.abs(bought - used) > 0.01)
      ) {
        return fail('Нельзя исправить закупку: её стоимость уже учтена в продажах или списаниях.');
      }
      break;
    }
    case 'sale': {
      const v = command.value;
      if (next.archived && v?.date < next.archived.before) {
        return fail('История этого периода удалена. Выберите более позднюю дату.');
      }
      if (
        !v ||
        !['cocktail', 'alcohol'].includes(v.kind) ||
        !dateValid(v.date) ||
        !number(v.quantity, true) ||
        (v.kind === 'cocktail' && !Number.isInteger(v.quantity))
      ) {
        return fail('Проверьте дату и количество: коктейли продаются целыми порциями.');
      }
      const product = (v.kind === 'cocktail' ? next.cocktails : next.alcohol).find(
        (p) => p.id === v.productId,
      );
      if (v.kind === 'alcohol' && (product as Alcohol)?.category !== 'alcohol')
        return fail('Выберите бутылку в разделе «Пиво», «Вино» или «Коньяк».');
      if (!product) {
        return fail('Напиток не найден. Обновите страницу.');
      }
      if (
        v.kind === 'cocktail' &&
        !(product as Cocktail).ingredients.length &&
        !(product as Cocktail).extraCosts?.length
      ) {
        return fail('Добавьте состав в редакторе меню перед первой продажей.');
      }
      const price =
        v.kind === 'cocktail'
          ? (product as Cocktail).price
          : (product as Alcohol).pricePerLiter / priceBasis(next, product.id);
      if (price <= 0) {
        return fail('Сначала укажите цену продажи в карточке напитка.');
      }
      const recipe =
        v.kind === 'cocktail' ? (product as Cocktail).ingredients : [{ alcoholId: product.id, ml: 1 }];
      const ingredients = recipe.map((i) => ({
        alcoholId: i.alcoholId,
        ml: quantityRound(next, i.alcoholId, i.ml * v.quantity),
        cost: round((averageCost(next, i.alcoholId) * i.ml * v.quantity) / priceBasis(next, i.alcoholId)),
      }));
      if (!ingredients.every((i) => ingredientAmountValid(next, i.alcoholId, i.ml) && number(i.cost))) {
        return fail('Слишком большое количество.');
      }
      const extraCosts =
        v.kind === 'cocktail'
          ? ((product as Cocktail).extraCosts || []).map((i) => ({
              alcoholId: i.alcoholId,
              name: next.alcohol.find((a) => a.id === i.alcoholId)!.name,
              cost: round(i.cost * v.quantity),
            }))
          : [];
      if (!extraCosts.every((i) => number(i.cost, true))) return fail('Слишком большая стоимость продуктов.');
      const sale: Sale = {
        ...(extraCosts.length ? { extraCosts } : {}),
        id: command.id,
        ...(v.kind === 'cocktail' && (product as Cocktail).stockAlcoholId
          ? { unit: (product as Cocktail).serving || ('bottle' as const) }
          : {}),
        ...(v.kind === 'cocktail' ? { category: (product as Cocktail).category || 'cocktail' } : {}),
        date: v.date,
        createdAt: new Date().toISOString(),
        kind: v.kind,
        productId: v.productId,
        name: product.name,
        quantity: v.quantity,
        revenue: round(price * v.quantity),
        cost: round(
          ingredients.reduce((sum, i) => sum + i.cost, 0) + extraCosts.reduce((sum, i) => sum + i.cost, 0),
        ),
        ingredients,
        voided: false,
      };
      if (!number(sale.revenue, true) || !number(sale.cost)) {
        return fail('Сумма продажи выходит за допустимые пределы.');
      }
      next.sales.push(sale);
      assertLedger(next);
      break;
    }
    case 'resetStock': {
      const drink = next.alcohol.find((a) => a.id === command.alcoholId);
      if (
        !drink ||
        !ingredientAmountValid(next, command.alcoholId, command.expectedMl) ||
        !number(command.expectedCost)
      ) {
        return fail('Выберите напиток с ненулевым остатком.');
      }
      const ml = stock(next, drink.id);
      const cost = round((averageCost(next, drink.id) * ml) / priceBasis(next, drink.id));
      if (ml !== command.expectedMl || cost !== command.expectedCost) {
        return fail(
          'Остаток или стоимость изменились. Закройте окно, обновите склад и подтвердите сброс заново.',
        );
      }
      next.stockResets = [
        ...resets(next),
        {
          id: command.id,
          alcoholId: drink.id,
          name: drink.name,
          date: today(),
          createdAt: new Date().toISOString(),
          ml,
          cost,
        },
      ];
      assertLedger(next);
      break;
    }
    case 'void': {
      const sale = next.sales.find((s) => s.id === command.saleId);
      if (!sale) {
        return fail('Продажа не найдена.');
      }
      sale.voided = true;
      break;
    }
    case 'purge': {
      const before = command.before;
      if (!dateValid(before) || (next.archived && before <= next.archived.before)) {
        return fail('Выберите более позднюю дату очистки, не позже сегодняшнего дня.');
      }
      const removed = next.sales.filter((s) => s.date < before);
      if (!removed.length) {
        return fail('До этой даты продаж нет.');
      }
      const used: Record<string, Ingredient & { cost: number }> = {};
      [...retired(next), ...removed.filter((s) => !s.voided).flatMap((s) => s.ingredients)].forEach((i) => {
        const old = used[i.alcoholId] || { alcoholId: i.alcoholId, ml: 0, cost: 0 };
        used[i.alcoholId] = {
          alcoholId: i.alcoholId,
          ml: quantityRound(next, i.alcoholId, old.ml + i.ml),
          cost: round(old.cost + i.cost),
        };
      });
      next.archived = {
        before,
        ingredients: Object.values(used),
        count: (next.archived?.count || 0) + removed.length,
      };
      next.sales = next.sales.filter((s) => s.date >= before);
      assertLedger(next);
      break;
    }
    case 'restore': {
      return { ...validateData(command.value), operations: [...data.operations.slice(-999), command.id] };
    }
    default: {
      return fail('Неизвестная операция.');
    }
  }
  next.operations = [...next.operations.slice(-999), command.id];
  return next;
}

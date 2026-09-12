import alcoholDefaults from './data/alcohol.json' with { type: 'json' };
import cocktailDefaults from './data/cocktails.json' with { type: 'json' };
import salesDefaults from './data/sales/initial.json' with { type: 'json' };
import { Alcohol, BarData, Cocktail, Command, Ingredient, MenuCategory, Sale } from './types';

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
  { id: 'hot', label: 'Горячие напитки' },
  { id: 'soft', label: 'Безалкогольные' },
  { id: 'snack', label: 'Закуски' },
];
export const categoryLabel = (category?: MenuCategory) =>
  categories.find((c) => c.id === (category || 'cocktail'))?.label || 'Коктейли';
export const ingredientUnit = (data: BarData, id: string) =>
  data.alcohol.find((a) => a.id === id)?.unit === 'g' ? 'г' : 'мл';
export const ingredientVolume = (data: BarData, id: string, amount: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ${ingredientUnit(data, id)}`;
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
  round(
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
    .reduce((n, p) => n + (p.ml * p.costPerLiter) / 1000, 0);
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
      1000,
  );
};
export const recipeCost = (data: BarData, recipe: Ingredient[]) =>
  round(recipe.reduce((n, i) => n + (averageCost(data, i.alcoholId) * i.ml) / 1000, 0));
export const recipeReady = (data: BarData, recipe: Ingredient[]) =>
  recipe.length > 0 && recipe.every((i) => averageCost(data, i.alcoholId) > 0);
export const portions = (data: BarData, recipe: Ingredient[]) =>
  recipe.length
    ? Math.max(0, Math.floor(Math.min(...recipe.map((i) => stock(data, i.alcoholId) / i.ml))))
    : 0;

function ingredientsValid(value: Ingredient[], data: BarData, maximum = 30) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maximum &&
    new Set(value.map((i) => i.alcoholId)).size === value.length &&
    value.every((i) => i && data.alcohol.some((a) => a.id === i.alcoholId) && number(i.ml, true))
  );
}
function alcoholValid(a: Alcohol) {
  return (
    a &&
    identifier(a.id) &&
    nameValid(a.name) &&
    ['alcohol', 'mixer'].includes(a.category) &&
    (a.unit === undefined || ['ml', 'g'].includes(a.unit)) &&
    (a.category !== 'alcohol' || a.unit !== 'g') &&
    number(a.costPerLiter) &&
    number(a.pricePerLiter) &&
    /^#[a-fA-F0-9]{6}$/.test(a.color)
  );
}
function cocktailValid(c: Cocktail, data: BarData) {
  return (
    c &&
    identifier(c.id) &&
    nameValid(c.name) &&
    number(c.price) &&
    Number.isInteger(c.image) &&
    c.image >= 0 &&
    c.image <= 11 &&
    (c.category === undefined || categories.some((k) => k.id === c.category)) &&
    (c.notes === undefined || (typeof c.notes === 'string' && c.notes.length <= 1000)) &&
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
      balances[i.alcoholId] = round((balances[i.alcoholId] || 0) + i.ml);
      if (balances[i.alcoholId] < -0.001) {
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
        number(p.ml, true) &&
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
        typeof s.voided === 'boolean' &&
        ingredientsValid(s.ingredients, d) &&
        s.ingredients.every((i) => number(i.cost)) &&
        Math.abs(s.cost - round(s.ingredients.reduce((sum, i) => sum + i.cost, 0))) < 0.001,
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
          number(r.ml, true) &&
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
        return fail('Заполните название и корректные цены за 1 000 мл.');
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
      if (index < 0) {
        next.alcohol.push({ ...a, name: a.name.trim() });
      } else {
        next.alcohol[index] = { ...a, name: a.name.trim() };
      }
      break;
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
        !number(p.ml, true) ||
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
      if (!product) {
        return fail('Напиток не найден. Обновите страницу.');
      }
      if (v.kind === 'cocktail' && !(product as Cocktail).ingredients.length) {
        return fail('Добавьте состав в редакторе меню перед первой продажей.');
      }
      const price =
        v.kind === 'cocktail' ? (product as Cocktail).price : (product as Alcohol).pricePerLiter / 1000;
      if (price <= 0) {
        return fail('Сначала укажите цену продажи в карточке напитка.');
      }
      const recipe =
        v.kind === 'cocktail' ? (product as Cocktail).ingredients : [{ alcoholId: product.id, ml: 1 }];
      const ingredients = recipe.map((i) => ({
        alcoholId: i.alcoholId,
        ml: round(i.ml * v.quantity),
        cost: round((averageCost(next, i.alcoholId) * i.ml * v.quantity) / 1000),
      }));
      if (!ingredients.every((i) => number(i.ml, true) && number(i.cost))) {
        return fail('Слишком большое количество.');
      }
      const sale: Sale = {
        id: command.id,
        ...(v.kind === 'cocktail' ? { category: (product as Cocktail).category || 'cocktail' } : {}),
        date: v.date,
        createdAt: new Date().toISOString(),
        kind: v.kind,
        productId: v.productId,
        name: product.name,
        quantity: v.quantity,
        revenue: round(price * v.quantity),
        cost: round(ingredients.reduce((sum, i) => sum + i.cost, 0)),
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
      if (!drink || !number(command.expectedMl, true) || !number(command.expectedCost)) {
        return fail('Выберите напиток с ненулевым остатком.');
      }
      const ml = stock(next, drink.id);
      const cost = round((averageCost(next, drink.id) * ml) / 1000);
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
          ml: round(old.ml + i.ml),
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

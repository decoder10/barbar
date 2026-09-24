import type { BarData, OperationsAction, StockMovement } from './types';
interface Calculations {
  stock: (data: BarData, id: string) => number;
  averageCost: (data: BarData, id: string) => number;
  priceBasis: (data: BarData, id: string) => number;
  round: (n: number) => number;
  day: () => string;
  /** Cost of using a prepared output that has batches; null when it has none (weighted average). */
  batchCost: (id: string, ml: number) => number | null;
  /** What is left of one batch and its unit cost. */
  batchRemaining: (id: string, batchId: string) => { remaining: number; unitCost: number } | undefined;
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e9;
const text = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 300;
const date = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const categories = ['rent', 'payroll', 'utilities', 'marketing', 'maintenance', 'other'];
const fail = (message: string): never => {
  throw new Error(message);
};
function quantity(data: BarData, id: string, value: unknown, zero = false) {
  const product = data.alcohol.find((a) => a.id === id);
  if (
    !product ||
    !finite(value) ||
    value < (zero ? 0 : 0.00000001) ||
    (product.unit === 'bottle' && product.category === 'beer' && !Number.isInteger(value))
  )
    fail('Проверьте позицию и количество.');
}
/** Commands are applied to a cloned ledger; financial snapshots are computed here, never accepted from the UI. */
export function applyOperations(
  data: BarData,
  command: OperationsAction & { id: string },
  calc: Calculations,
) {
  if (command.type === 'expense') {
    const v = command.value;
    if (
      !v ||
      !date(v.date) ||
      v.date > calc.day() ||
      !categories.includes(v.category) ||
      !text(v.description) ||
      !finite(v.amount) ||
      v.amount <= 0 ||
      calc.round(v.amount) !== v.amount
    )
      fail('Проверьте дату, категорию, описание и сумму расхода.');
    data.expenses = [
      ...(data.expenses || []),
      {
        id: command.id,
        date: v.date,
        category: v.category,
        description: v.description.trim(),
        amount: v.amount,
        voided: false,
      },
    ];
    return;
  }
  if (command.type === 'voidExpense') {
    const expense = data.expenses?.find((e) => e.id === command.expenseId);
    if (!expense) return fail('Расход не найден.');
    expense.voided = true;
    return;
  }
  if (!text(command.reason)) fail('Укажите причину или название партии.');
  const movement: StockMovement = {
    id: command.id,
    kind: command.type,
    date: calc.day(),
    createdAt: new Date().toISOString(),
    reason: command.reason.trim(),
    lines: [],
  };
  const line = (id: string, amount: number, basisCost = calc.averageCost(data, id)) => ({
    alcoholId: id,
    ml: amount,
    cost: calc.round((amount * basisCost) / calc.priceBasis(data, id)),
  });
  if (command.type === 'writeoff') {
    quantity(data, command.alcoholId, command.quantity);
    if (calc.stock(data, command.alcoholId) !== command.expected)
      fail('Остаток изменился. Обновите склад и повторите списание.');
    if (command.quantity > command.expected + 1e-7) fail('Для списания недостаточно остатка.');
    if (command.batchId !== undefined) {
      const batch = calc.batchRemaining(command.alcoholId, command.batchId);
      if (!batch) fail('Партия не найдена или уже использована.');
      if (command.quantity > batch!.remaining + 1e-7) fail('В партии меньше указанного количества.');
      // The balance and its batches can disagree (use before batches and count shortages go at the
      // average), so the cost never exceeds the balance's and emptying the item takes all of it.
      const balanceCost = Math.max(
        0,
        (calc.averageCost(data, command.alcoholId) * command.expected) /
          calc.priceBasis(data, command.alcoholId),
      );
      const emptied = command.quantity >= command.expected - 1e-7;
      movement.batchId = command.batchId;
      movement.lines = [
        {
          alcoholId: command.alcoholId,
          ml: -command.quantity,
          cost: -calc.round(
            emptied ? balanceCost : Math.min(balanceCost, command.quantity * batch!.unitCost),
          ),
        },
      ];
    } else {
      const cost = calc.batchCost(command.alcoholId, command.quantity);
      movement.lines = [
        cost === null
          ? line(command.alcoholId, -command.quantity)
          : { alcoholId: command.alcoholId, ml: -command.quantity, cost: -cost },
      ];
    }
  } else if (command.type === 'count') {
    if (
      !Array.isArray(command.lines) ||
      !command.lines.length ||
      command.lines.length > 300 ||
      new Set(command.lines.map((l) => l.alcoholId)).size !== command.lines.length
    )
      fail('Укажите уникальные позиции инвентаризации.');
    for (const item of command.lines) {
      quantity(data, item.alcoholId, item.actual, true);
      if (!finite(item.expected) || calc.stock(data, item.alcoholId) !== item.expected)
        fail('Остаток изменился. Повторите пересчёт с актуальными данными.');
      const difference = Math.round((item.actual - item.expected) * 1e8) / 1e8;
      const cost = item.costPerBasis ?? calc.averageCost(data, item.alcoholId);
      if (!finite(cost) || cost < 0 || (difference > 0 && cost <= 0))
        fail('Для найденного излишка укажите стоимость единицы учёта.');
      // Shortages always use the existing weighted cost.
      if (difference !== 0)
        movement.lines.push(
          line(item.alcoholId, difference, difference > 0 ? cost : calc.averageCost(data, item.alcoholId)),
        );
    }
    movement.counted = command.lines.map((l) => ({
      alcoholId: l.alcoholId,
      expected: l.expected,
      actual: l.actual,
    }));
  } else {
    quantity(data, command.outputId, command.quantity);
    if (
      !Array.isArray(command.ingredients) ||
      !command.ingredients.length ||
      command.ingredients.length > 30 ||
      new Set(command.ingredients.map((i) => i.alcoholId)).size !== command.ingredients.length
    )
      fail('Добавьте уникальные ингредиенты партии.');
    for (const i of command.ingredients) {
      quantity(data, i.alcoholId, i.ml);
      if (i.alcoholId === command.outputId) fail('Готовая заготовка должна быть отдельной позицией склада.');
      if (calc.stock(data, i.alcoholId) + 1e-7 < i.ml) fail('Недостаточно ингредиентов для партии.');
      const cost = calc.batchCost(i.alcoholId, i.ml);
      movement.lines.push(
        cost === null ? line(i.alcoholId, -i.ml) : { alcoholId: i.alcoholId, ml: -i.ml, cost: -cost },
      );
    }
    const cost = calc.round(-movement.lines.reduce((sum, i) => sum + i.cost, 0));
    movement.lines.push({ alcoholId: command.outputId, ml: command.quantity, cost });
    movement.outputId = command.outputId;
    movement.outputQuantity = command.quantity;
    if (command.plannedQuantity !== undefined) {
      if (!finite(command.plannedQuantity) || command.plannedQuantity <= 0)
        fail('Проверьте плановый выход партии.');
      movement.plannedQuantity = command.plannedQuantity;
    }
    if (command.expiresOn) {
      if (!date(command.expiresOn) || command.expiresOn < calc.day()) fail('Проверьте срок годности партии.');
      movement.expiresOn = command.expiresOn;
    }
  }
  data.stockMovements = [...(data.stockMovements || []), movement];
}
export function validateOperations(data: BarData) {
  const ids = new Set(data.alcohol.map((a) => a.id));
  const identifier = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const cents = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-5;
  const validMovement = (m: StockMovement) => {
    if (
      !m ||
      !identifier(m.id) ||
      !['count', 'writeoff', 'prepare'].includes(m.kind) ||
      !date(m.date) ||
      typeof m.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(m.createdAt)) ||
      !text(m.reason) ||
      !Array.isArray(m.lines) ||
      m.lines.length > 301 ||
      new Set(m.lines.map((l) => l?.alcoholId)).size !== m.lines.length
    )
      return false;
    for (const l of m.lines) {
      if (
        !l ||
        !ids.has(l.alcoholId) ||
        !finite(l.ml) ||
        l.ml === 0 ||
        !finite(l.cost) ||
        !cents(l.cost) ||
        (l.ml > 0 ? l.cost < 0 : l.cost > 0)
      )
        return false;
      const product = data.alcohol.find((a) => a.id === l.alcoholId)!;
      if (product.category === 'beer' && product.unit === 'bottle' && !Number.isInteger(l.ml)) return false;
    }
    if (m.batchId !== undefined && m.kind !== 'writeoff') return false;
    if (
      m.plannedQuantity !== undefined &&
      (m.kind !== 'prepare' || !finite(m.plannedQuantity) || m.plannedQuantity <= 0)
    )
      return false;
    if (m.kind === 'writeoff')
      return (
        m.lines.length === 1 &&
        m.lines[0].ml < 0 &&
        !m.counted &&
        !m.outputId &&
        (m.batchId === undefined ||
          !!data.stockMovements?.some(
            (b) => b.id === m.batchId && b.kind === 'prepare' && b.outputId === m.lines[0].alcoholId,
          ))
      );
    if (m.kind === 'prepare')
      return (
        m.lines.length >= 2 &&
        m.lines.length <= 31 &&
        ids.has(m.outputId || '') &&
        finite(m.outputQuantity) &&
        m.outputQuantity > 0 &&
        m.lines.filter((l) => l.ml > 0).length === 1 &&
        m.lines.some((l) => l.alcoholId === m.outputId && l.ml === m.outputQuantity) &&
        Math.abs(m.lines.reduce((s, l) => s + l.cost, 0)) < 0.001 &&
        (!m.expiresOn || (date(m.expiresOn) && m.expiresOn >= m.date)) &&
        !m.counted
      );
    if (
      !Array.isArray(m.counted) ||
      !m.counted.length ||
      m.counted.length > 300 ||
      new Set(m.counted.map((c) => c?.alcoholId)).size !== m.counted.length ||
      m.outputId
    )
      return false;
    return (
      m.counted.every((c) => {
        if (
          !c ||
          !ids.has(c.alcoholId) ||
          !finite(c.expected) ||
          !finite(c.actual) ||
          c.expected < 0 ||
          c.actual < 0
        )
          return false;
        const difference = c.actual - c.expected;
        const line = m.lines.find((l) => l.alcoholId === c.alcoholId);
        return Math.abs(difference) < 1e-8 ? !line : !!line && Math.abs(line.ml - difference) < 1e-7;
      }) && m.lines.every((l) => m.counted!.some((c) => c.alcoholId === l.alcoholId))
    );
  };
  if (
    data.stockMovements !== undefined &&
    (!Array.isArray(data.stockMovements) ||
      new Set(data.stockMovements.map((m) => m?.id)).size !== data.stockMovements.length ||
      !data.stockMovements.every(validMovement))
  )
    fail('Некорректные складские операции в файле.');
  if (
    data.expenses !== undefined &&
    (!Array.isArray(data.expenses) ||
      new Set(data.expenses.map((e) => e?.id)).size !== data.expenses.length ||
      !data.expenses.every(
        (e) =>
          e &&
          identifier(e.id) &&
          date(e.date) &&
          categories.includes(e.category) &&
          text(e.description) &&
          finite(e.amount) &&
          e.amount > 0 &&
          cents(e.amount) &&
          typeof e.voided === 'boolean',
      ))
  )
    fail('Некорректные расходы в файле.');
}

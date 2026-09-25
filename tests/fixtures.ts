import { businessToday } from '../src/barbar/domain/business-day';
import { initialData } from '../src/barbar/domain/model';
import type { BarData, Ingredient } from '../src/barbar/domain/types';
export function fixtureData(): BarData {
  const d = JSON.parse(JSON.stringify(initialData())) as BarData;
  const prices: Record<string, number> = {
    beer: 1200,
    vodka: 4200,
    wine: 3600,
    martini: 6200,
    aperol: 8500,
    rum: 7500,
    tequila: 9600,
    whisky: 11000,
    cognac: 8000,
    gin: 9200,
    jager: 8800,
    becherovka: 7000,
    soda: 250,
    tonic: 900,
    cola: 650,
  };
  d.alcohol = d.alcohol.map((a) => ({
    ...a,
    costPerLiter: prices[a.id] || 1000,
    pricePerLiter: (prices[a.id] || 1000) * 3,
  }));
  const recipes: Ingredient[][] = [
    [
      { alcoholId: 'gin', ml: 50 },
      { alcoholId: 'tonic', ml: 150 },
    ],
    [
      { alcoholId: 'gin-bombay', ml: 50 },
      { alcoholId: 'tonic', ml: 150 },
    ],
    [
      { alcoholId: 'rum', ml: 50 },
      { alcoholId: 'cola', ml: 150 },
    ],
    [
      { alcoholId: 'aperol', ml: 60 },
      { alcoholId: 'wine', ml: 90 },
      { alcoholId: 'soda', ml: 30 },
    ],
  ];
  d.cocktails = d.cocktails.map((c, i) => ({
    ...c,
    ingredients: recipes[i] || [],
    notes: i < 4 ? 'Тестовый рецепт' : c.notes,
  }));
  d.purchases = d.alcohol.map((a) => ({
    id: `demo-${a.id}`,
    alcoholId: a.id,
    date: businessToday(),
    ml: 2000,
    costPerLiter: a.costPerLiter,
  }));
  return d;
}

/** Serves the tables board from an in-test ledger, the way `/api/barbar/orders` does on the server. */
export async function mockOrders(
  page: import('@playwright/test').Page,
  ledger: () => BarData,
  role: () => 'admin' | 'barbar' = () => 'admin',
) {
  const { staffSale } = await import('../netlify/lib/barbar-access');
  const { ordersSnapshot } = await import('../src/barbar/domain/orders');
  await page.route('**/api/barbar/orders', (route) => {
    const data = ledger();
    const snapshot = ordersSnapshot(data);
    return route.fulfill({
      json: {
        role: role(),
        revision: String(data.operations.length),
        ...snapshot,
        sales: role() === 'admin' ? snapshot.sales : snapshot.sales.map(staffSale),
      },
    });
  });
}

/** Serves the paid receipts to repeat, the way `/api/barbar/orders/recent` does: the asker's own or a table's. */
export async function mockRecentOrders(
  page: import('@playwright/test').Page,
  ledger: () => BarData,
  role: () => 'admin' | 'barbar' = () => 'admin',
) {
  const { staffSale } = await import('../netlify/lib/barbar-access');
  await page.route('**/api/barbar/orders/recent*', (route) => {
    const data = ledger();
    const params = new URL(route.request().url()).searchParams;
    const orders = (data.orders || [])
      .filter(
        (o) =>
          o.status === 'paid' &&
          (params.get('scope') === 'mine' ? o.openedBy?.id === role() : o.tableId === params.get('tableId')),
      )
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    return route.fulfill({
      json: {
        orders: orders.map((o) => ({
          id: o.id,
          ...(o.tableId ? { tableId: o.tableId } : {}),
          businessDay: o.businessDay,
          openedAt: o.openedAt,
          closedAt: o.closedAt,
          total: o.total,
          lines: data.sales
            .filter((s) => s.orderId === o.id && !s.voided)
            .map((s) => (role() === 'admin' ? s : staffSale(s))),
        })),
      },
    });
  });
}

const genitiveMonths =
  'января февраля марта апреля мая июня июля августа сентября октября ноября декабря'.split(' ');

/** Picks a `YYYY-MM-DD` day in the app's calendar (`ui/date-picker.tsx`), paging months towards it. */
export async function pickDay(page: import('@playwright/test').Page, label: string, date: string) {
  const trigger = page.getByRole('button', { name: new RegExp(`^${label}:`) });
  const from = (await trigger.getAttribute('data-value')) || date;
  await trigger.click();
  const panel = page.getByRole('dialog', { name: label });
  const [year, month, day] = date.split('-').map(Number);
  const cell = panel.getByRole('button', {
    name: new RegExp(`(^|\\s)${day} ${genitiveMonths[month - 1]} ${year}`),
  });
  const step = panel.getByRole('button', { name: date < from ? 'Предыдущий месяц' : 'Следующий месяц' });
  for (let i = 0; i < 36 && !(await cell.count()); i++) await step.click();
  await cell.first().click();
}

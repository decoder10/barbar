import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mongoRepository } from './barbar-mongo';
import { handleCompare } from './queries/compare';
import { handlePrices } from './queries/prices';
import { compare, periodFromSales } from '../../src/barbar/domain/reports/compare';
import { applyCommand, initialData } from '../../src/barbar/domain/model';
import { businessToday } from '../../src/barbar/domain/business-day';
import type { UserProfile } from '../../src/barbar/domain/identity/user';
import type { BarData, Command, Sale } from '../../src/barbar/domain/types';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
describe.skipIf(!uri)(
  'repeat orders, batch costing, suppliers and price history (disposable MongoDB)',
  () => {
    if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
      throw new Error('Local test URI required');
    const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 3000 });
    const databases: string[] = [];
    const owner: UserProfile = {
      id: 'owner',
      username: 'owner',
      fullName: 'Owner',
      email: '',
      phone: '',
      role: 'owner',
      active: true,
      createdAt: new Date().toISOString(),
    };
    const context = { actor: { id: owner.id, fullName: owner.fullName } };
    const later = (days: number) =>
      new Date(Date.parse(`${businessToday()}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    beforeAll(() => client.connect());
    afterAll(async () => {
      for (const name of databases) {
        if (!name.startsWith('barbar_test_priority2_')) throw new Error('Unsafe test database');
        await client.db(name).dropDatabase();
      }
      await client.close();
    });
    async function create() {
      const name = `barbar_test_priority2_${crypto.randomUUID().replaceAll('-', '')}`;
      databases.push(name);
      const db = client.db(name);
      let data: BarData = initialData();
      data.alcohol = [
        {
          ...data.alcohol.find((a) => a.unit !== 'bottle')!,
          id: 'vodka',
          name: 'Водка',
          category: 'alcohol',
          pricePerLiter: 9000,
        },
        { ...data.alcohol[0], id: 'prep', name: 'Заготовка', unit: 'ml', category: 'mixer' },
      ];
      data.cocktails = [
        { id: 'drink', name: 'Напиток', price: 900, image: 0, ingredients: [{ alcoholId: 'prep', ml: 100 }] },
      ];
      data.sales = [];
      data = applyCommand(data, {
        id: 'table',
        type: 'saveTable',
        value: { id: 'table', name: '1', order: 0, active: true },
      });
      data = applyCommand(data, {
        id: 'purchase',
        type: 'purchase',
        value: { id: 'purchase', alcoholId: 'vodka', date: businessToday(), ml: 2000, costPerLiter: 2000 },
      });
      const repo = mongoRepository(client, db, async () => data);
      await repo.read();
      const run = (command: Command) => repo.execute!(command, owner, context);
      return { db, repo, run };
    }
    const prepare = (id: string, vodka: number, quantity: number, days: number): Command => ({
      type: 'prepare',
      id,
      reason: `Партия ${id}`,
      outputId: 'prep',
      quantity,
      ingredients: [{ alcoholId: 'vodka', ml: vodka }],
      expiresOn: later(days),
    });
    const balance = async (db: ReturnType<typeof client.db>, id: string) =>
      db.collection('stockBalances').findOne({ _id: id as never });

    it('repeats an order once: a retry and a second device do not duplicate lines', async () => {
      const { db, run } = await create();
      await run(prepare('cheap', 200, 400, 20));
      await run({
        type: 'sale',
        id: 'x-open',
        value: {
          kind: 'alcohol',
          productId: 'vodka',
          quantity: 50,
          date: businessToday(),
          businessDay: true,
        },
      });
      const command: Command = {
        type: 'addLines',
        id: 'repeat-1',
        tableId: 'table',
        lines: [
          { kind: 'cocktail', productId: 'drink', quantity: 2 },
          { kind: 'alcohol', productId: 'vodka', quantity: 100 },
        ],
        expectedTotal: 1800 + 900,
      };
      await run(command);
      await run(command);
      expect(await db.collection('orders').countDocuments({ tableId: 'table' })).toBe(1);
      expect(await db.collection('sales').countDocuments({ orderId: 'repeat-1' })).toBe(2);
      // 50 + 100 ml of vodka sold, 400 − 200 ml of the batch left: stock counted once.
      expect((await balance(db, 'vodka'))!.ml).toBe(2000 - 200 - 50 - 100);
      expect((await balance(db, 'prep'))!.ml).toBe(200);
      // A changed price refuses the set and writes nothing.
      await expect(run({ ...command, id: 'repeat-2', expectedTotal: 1 })).rejects.toThrow('Цены изменились');
      expect(await db.collection('sales').countDocuments({ orderId: 'repeat-1' })).toBe(2);
      expect(await db.collection('orders').countDocuments({ tableId: 'table' })).toBe(1);
    });

    it('costs a portion by its batch without double counting stock, and cancellation restores it', async () => {
      const { db, run } = await create();
      await run(prepare('cheap', 200, 400, 20));
      await run(prepare('dear', 400, 400, 5));
      expect((await balance(db, 'prep'))!.ml).toBe(800);
      await run({
        type: 'sale',
        id: 'sale-1',
        value: {
          kind: 'cocktail',
          productId: 'drink',
          quantity: 3,
          date: businessToday(),
          businessDay: true,
        },
      });
      const sale = await db.collection('sales').findOne({ _id: 'sale-1' as never });
      expect(sale).toMatchObject({
        cost: 600,
        ingredients: [
          { alcoholId: 'prep', ml: 300, cost: 600, batches: [{ id: 'dear', ml: 300, cost: 600 }] },
        ],
      });
      // 800 − 300, once: the batch rows were not loaded as movements.
      expect(await balance(db, 'prep')).toMatchObject({ ml: 500, cost: 600 });
      await run({
        type: 'sale',
        id: 'sale-2',
        value: {
          kind: 'cocktail',
          productId: 'drink',
          quantity: 2,
          date: businessToday(),
          businessDay: true,
        },
      });
      expect((await db.collection('sales').findOne({ _id: 'sale-2' as never }))!.cost).toBe(300);
      await run({ type: 'void', id: 'void-1', saleId: 'sale-1' });
      // The stored quantity and cost come back exactly.
      expect(await balance(db, 'prep')).toMatchObject({ ml: 600, cost: 900 });
      expect(await db.collection('stockMovements').countDocuments()).toBe(2);
    });

    it('writes off one batch and corrects the yield of an untouched one', async () => {
      const { db, run } = await create();
      await run(prepare('cheap', 200, 400, 20));
      await run(prepare('dear', 400, 400, 5));
      await run({
        type: 'writeoff',
        id: 'wo',
        reason: 'Испортилась',
        alcoholId: 'prep',
        quantity: 150,
        expected: 800,
        batchId: 'cheap',
      });
      expect(await db.collection('stockMovements').findOne({ _id: 'wo' as never })).toMatchObject({
        batchId: 'cheap',
        lines: [{ ml: -150, cost: -150 }],
      });
      expect((await balance(db, 'prep'))!.ml).toBe(650);
      await run({
        type: 'correctBatchYield',
        id: 'fix',
        batchId: 'dear',
        expected: 400,
        actual: 380,
        reason: 'Взвесили',
      });
      expect(await db.collection('stockMovements').findOne({ _id: 'dear' as never })).toMatchObject({
        outputQuantity: 380,
      });
      expect(await balance(db, 'prep')).toMatchObject({ ml: 630, cost: 1200 - 150 });
      await expect(
        run({
          type: 'correctBatchYield',
          id: 'fix-2',
          batchId: 'cheap',
          expected: 400,
          actual: 300,
          reason: 'Поздно',
        }),
      ).rejects.toThrow('использована');
    });

    it('caps a batch write-off at the stored balance cost when the batches disagree', async () => {
      const { db, run } = await create();
      await run(prepare('cheap', 200, 400, 5));
      await run(prepare('dear', 400, 400, 20));
      // A shortage goes at the average (1.5): 400 ml and 600 are left, attributed to the dear batch (2).
      await run({
        type: 'count',
        id: 'count',
        reason: 'Пересчёт',
        lines: [{ alcoholId: 'prep', expected: 800, actual: 400 }],
      });
      expect(await balance(db, 'prep')).toMatchObject({ ml: 400, cost: 600 });
      await run({
        type: 'writeoff',
        id: 'wo-all',
        reason: 'Испортилась',
        alcoholId: 'prep',
        quantity: 400,
        expected: 400,
        batchId: 'dear',
      });
      expect(await db.collection('stockMovements').findOne({ _id: 'wo-all' as never })).toMatchObject({
        batchId: 'dear',
        lines: [{ alcoholId: 'prep', ml: -400, cost: -600 }],
      });
      // No negative cost is left on an empty balance.
      expect(await balance(db, 'prep')).toMatchObject({ ml: 0, cost: 0 });
    });

    it('refuses to correct the yield of a batch a stored sale drew from', async () => {
      const { db, run } = await create();
      await run(prepare('first', 200, 400, 20));
      await run({
        type: 'sale',
        id: 'sold',
        value: {
          kind: 'cocktail',
          productId: 'drink',
          quantity: 1,
          date: businessToday(),
          businessDay: true,
        },
      });
      // An earlier-expiring batch takes the use; FEFO now shows the first batch full.
      await run(prepare('second', 400, 400, 5));
      const correct: Command = {
        type: 'correctBatchYield',
        id: 'fix',
        batchId: 'first',
        expected: 400,
        actual: 350,
        reason: 'Взвесили',
      };
      await expect(run(correct)).rejects.toThrow('использована');
      expect(await balance(db, 'prep')).toMatchObject({ ml: 700, cost: 1100 });
      expect(await db.collection('stockMovements').findOne({ _id: 'first' as never })).toMatchObject({
        outputQuantity: 400,
      });
      await run({ type: 'void', id: 'void', saleId: 'sold' });
      await run({ ...correct, id: 'fix-2' });
      expect(await balance(db, 'prep')).toMatchObject({ ml: 750, cost: 1200 });
    });

    it('records price changes only when the price changes, and keeps suppliers consistent', async () => {
      const { db, repo, run } = await create();
      const { data } = await repo.readWorking!();
      const drink = data.cocktails[0];
      await run({ type: 'cocktail', id: 'same', value: { ...drink, notes: 'заметка' } });
      expect(await db.collection('priceChanges').countDocuments()).toBe(0);
      await run({ type: 'cocktail', id: 'raise', value: { ...drink, price: 1100 } });
      expect(await db.collection('priceChanges').findOne({})).toMatchObject({
        kind: 'cocktail',
        productId: 'drink',
        field: 'price',
        from: 900,
        to: 1100,
        actor: context.actor,
      });
      await run({ type: 'saveSupplier', id: 'sp', value: { id: 'opt', name: 'Опт', leadDays: 4 } });
      const vodka = (await repo.readWorking!()).data.alcohol.find((a) => a.id === 'vodka')!;
      await run({ type: 'alcohol', id: 'link', value: { ...vodka, supplierId: 'opt', safetyDays: 2 } });
      expect(await db.collection('alcohol').findOne({ id: 'vodka' })).toMatchObject({
        supplierId: 'opt',
        safetyDays: 2,
      });
      await expect(run({ type: 'saveSupplier', id: 'sp2', value: { id: 'x', name: 'опт' } })).rejects.toThrow(
        'уже есть',
      );
      await run({ type: 'removeSupplier', id: 'rm', supplierId: 'opt' });
      expect(await db.collection('suppliers').countDocuments()).toBe(0);
      const unlinked = (await db.collection('alcohol').findOne({ id: 'vodka' }))!;
      expect(unlinked.supplierId).toBeUndefined();
      // Only the key the command removed leaves the document; the rest of the row survives.
      expect(unlinked).toMatchObject({ safetyDays: 2, name: vodka.name, pricePerLiter: vodka.pricePerLiter });
    });

    it('lists the latest paid receipts of a user and of a table', async () => {
      const { repo, run } = await create();
      await run({
        type: 'addLines',
        id: 'r1',
        tableId: 'table',
        lines: [{ kind: 'alcohol', productId: 'vodka', quantity: 100 }],
        expectedTotal: 900,
      });
      await run({
        type: 'payOrder',
        id: 'pay-1',
        orderId: 'r1',
        expectedTotal: 900,
        payments: [{ method: 'cash', amount: 900 }],
      });
      const mine = await repo.readRecentOrders!({ scope: 'mine', userId: 'owner', limit: 20 });
      expect(mine.orders.map((o) => o.id)).toEqual(['r1']);
      expect(mine.sales).toHaveLength(1);
      expect(
        (await repo.readRecentOrders!({ scope: 'table', userId: 'someone', tableId: 'table', limit: 20 }))
          .orders,
      ).toHaveLength(1);
      expect(
        (await repo.readRecentOrders!({ scope: 'mine', userId: 'someone-else', limit: 20 })).orders,
      ).toHaveLength(0);
    });

    it('builds the new indexes under the v5 marker', async () => {
      const { db } = await create();
      expect(
        await db.collection('appMigrations').findOne({ _id: 'ledger-indexes-v5' as never }),
      ).toBeTruthy();
      const names = async (collection: string) =>
        (await db.collection(collection).indexes()).map((i) => i.name);
      expect(await names('orders')).toEqual(
        expect.arrayContaining(['orders_by_opener', 'orders_by_table_recent']),
      );
      expect(await names('stockMovements')).toContain('batch_writeoffs');
      expect(await names('sales')).toContain('sale_batches');
      expect(await names('priceChanges')).toEqual(
        expect.arrayContaining(['productId_1_createdAt_-1', 'createdAt_-1']),
      );
    });

    const sale = (id: string, day: string, extra: Partial<Sale>): Sale => ({
      id,
      date: day,
      createdAt: `${day}T15:00:00.000Z`,
      kind: 'cocktail',
      productId: 'drink',
      name: 'Напиток',
      category: 'cocktail',
      quantity: 1,
      revenue: 900,
      cost: 100,
      ingredients: [{ alcoholId: 'prep', ml: 100, cost: 100 }],
      voided: false,
      ...extra,
    });
    const insert = (db: ReturnType<typeof client.db>, sales: Sale[]) =>
      db
        .collection('sales')
        .insertMany(sales.map((row, order) => ({ ...row, _id: row.id as never, _order: order })));

    it('reads the period comparison from MongoDB with the same figures as the domain', async () => {
      const { db } = await create();
      const rows = [
        sale('c-1', later(-1), { quantity: 3, revenue: 2700, cost: 300 }),
        sale('c-2', later(-2), {
          kind: 'alcohol',
          productId: 'vodka',
          name: 'Водка',
          category: undefined,
          quantity: 100,
          revenue: 900,
          cost: 200,
          ingredients: [{ alcoholId: 'vodka', ml: 100, cost: 200 }],
        }),
        sale('c-3', later(-2), { revenue: 900, cost: 0, voided: true }),
        // Entered a day later than its business day: no hour.
        sale('b-1', later(-8), {
          quantity: 2,
          revenue: 1800,
          cost: 200,
          createdAt: `${later(-6)}T10:00:00.000Z`,
        }),
      ].map((row) =>
        row.category === undefined ? (({ category, ...rest }) => (void category, rest))(row) : row,
      ) as Sale[];
      await insert(db, rows);
      const params = new URLSearchParams({
        from: later(-6),
        to: later(0),
        baseFrom: later(-13),
        baseTo: later(-7),
      });
      const response = await handleCompare(params, db);
      const body = await response.json();
      const expected = compare(
        periodFromSales(rows, later(-6), later(0)),
        periodFromSales(rows, later(-13), later(-7)),
      );
      expect(body.comparison).toEqual(JSON.parse(JSON.stringify(expected)));
      expect(body.comparison.current.revenue).toBe(3600);
      expect(body.comparison.base.revenue).toBe(1800);
      expect(body.comparison.hours.map((h: { key: string }) => h.key)).toContain('unknown');
      const d = body.comparison.decomposition;
      expect(d.volume + d.mix + d.price + d.range).toBeCloseTo(d.delta, 2);
      await expect(
        handleCompare(
          new URLSearchParams({ from: 'x', to: later(0), baseFrom: later(-13), baseTo: later(-7) }),
          db,
        ),
      ).rejects.toThrow('Проверьте');
    });

    it('reads price changes with equal windows, sales, profit and availability', async () => {
      const { db } = await create();
      await insert(db, [
        sale('p-1', later(-12), {
          quantity: 2,
          revenue: 1800,
          cost: 200,
          ingredients: [{ alcoholId: 'prep', ml: 200, cost: 200 }],
        }),
        sale('p-2', later(-5), {
          quantity: 3,
          revenue: 3300,
          cost: 300,
          ingredients: [{ alcoholId: 'prep', ml: 300, cost: 300 }],
        }),
      ]);
      await db.collection('priceChanges').insertOne({
        _id: 'change-1' as never,
        id: 'change-1',
        _order: 1,
        date: later(-10),
        createdAt: `${later(-10)}T09:00:00.000Z`,
        kind: 'cocktail',
        productId: 'drink',
        name: 'Напиток',
        field: 'price',
        from: 900,
        to: 1100,
      });
      const body = await (
        await handlePrices(new URLSearchParams({ kind: 'cocktail', productId: 'drink' }), db)
      ).json();
      expect(body.trackingSince).toBe(businessToday());
      expect(body.changes).toHaveLength(1);
      const { windows } = body.changes[0];
      // Ten days after the change: ten days on each side, without the change day itself.
      expect(windows.length).toBe(10);
      expect(windows.before).toMatchObject({
        from: later(-20),
        to: later(-11),
        units: 2,
        revenue: 1800,
        grossProfit: 1600,
        averagePrice: 900,
        salesDays: 1,
        workedDays: 1,
        availableDays: 1,
      });
      expect(windows.after).toMatchObject({
        from: later(-9),
        to: later(0),
        units: 3,
        revenue: 3300,
        grossProfit: 3000,
        averagePrice: 1100,
        salesDays: 1,
        workedDays: 1,
        availableDays: 1,
      });
      // Nothing else moved: the price of the item is unchanged by reading the history.
      expect((await db.collection('cocktails').findOne({ id: 'drink' }))!.price).toBe(900);
      await expect(handlePrices(new URLSearchParams({ kind: 'bad' }), db)).rejects.toThrow('Проверьте');
      expect(
        (await (await handlePrices(new URLSearchParams({ kind: 'cocktail', productId: 'other' }), db)).json())
          .changes,
      ).toEqual([]);
    });
  },
);

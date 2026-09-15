import type { ClientSession, Db } from 'mongodb';
import type { BarData } from '../../../src/barbar/domain/types';
import { round, unitBasis } from '../../../src/barbar/domain/model';
import type { PurchaseNotice } from '../../../src/barbar/domain/notifications/message';
import {
  stockLevels,
  stockTransitions,
  type StockAlert,
} from '../../../src/barbar/domain/notifications/stock-alerts';
export interface AlertEvent {
  _id: string;
  alerts: StockAlert[];
  createdAt: Date;
  expiresAt: Date;
  nextAttempt: Date;
  attempts: number;
  delivered: string[];
  done: boolean;
}
export async function recordStockAlerts(
  db: Db,
  session: ClientSession,
  id: string,
  before: BarData,
  after: BarData,
) {
  const alerts = stockTransitions(stockLevels(before), stockLevels(after));
  if (!alerts.length) return;
  const now = new Date();
  await db.collection<AlertEvent>('stockAlertEvents').insertOne(
    {
      _id: id,
      alerts,
      createdAt: now,
      expiresAt: new Date(+now + 86400000),
      nextAttempt: now,
      attempts: 0,
      delivered: [],
      done: false,
    },
    { session },
  );
}

export interface PurchaseEvent extends Omit<AlertEvent, 'alerts'> {
  purchase: PurchaseNotice;
}
/** Written in the purchase transaction: no notice without a saved purchase, one notice per command ID. */
export async function recordPurchaseEvent(
  db: Db,
  session: ClientSession,
  id: string,
  after: BarData,
  purchaseId: string,
) {
  const purchase = after.purchases.find((p) => p.id === purchaseId);
  if (!purchase) return;
  const item = after.alcohol.find((a) => a.id === purchase.alcoholId);
  const now = new Date();
  await db.collection<PurchaseEvent>('purchaseEvents').insertOne(
    {
      _id: id,
      purchase: {
        purchaseId,
        name: item?.name || purchase.alcoholId,
        quantity: purchase.ml,
        unit: item?.unit || 'ml',
        amount: round((purchase.ml * purchase.costPerLiter) / unitBasis(item?.unit)),
        date: purchase.date,
        createdAt: now.toISOString(),
      },
      createdAt: now,
      expiresAt: new Date(+now + 7 * 86400000),
      nextAttempt: now,
      attempts: 0,
      delivered: [],
      done: false,
    },
    { session },
  );
}

import type { ClientSession, Db } from 'mongodb';
import type { BarData } from '../../../src/barbar/domain/types';
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

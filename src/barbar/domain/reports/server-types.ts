import type { Sale, StaffSale } from '../types';
export interface SalesGroup {
  productId: string;
  name: string;
  kind: Sale['kind'];
  unit?: Sale['unit'];
  category?: Sale['category'];
  servingMl?: number;
  quantity: number;
  operations: number;
  revenue?: number;
  cost?: number;
  knownCost?: boolean;
  knownOperations?: number;
  knownRevenue?: number;
  knownCostTotal?: number;
}
export interface HistoryPage<T = Sale> {
  rows: T[];
  nextCursor: string | null;
  /** Period totals come with the first page only; later pages keep the loaded ones. */
  groups?: SalesGroup[];
  total?: number;
}
export type StaffHistory = HistoryPage<StaffSale>;
export interface ServerReport {
  performance: import('./pricing').ProductPerformance[];
  analytics: ReturnType<typeof import('./analytics').reportAnalytics>;
  purchaseTotal: number;
  purchaseCount: number;
  consumed: Record<string, number>;
  groups: SalesGroup[];
  daily: { date: string; revenue: number }[];
  expenses: number;
  losses: number;
  cancellations: number;
  forecast: import('./purchasing').ForecastRow[];
  suppliers: import('../types').Supplier[];
}

import type { BarData, Role, Sale, StaffData, StaffSale } from '../types';
export interface StockEntry {
  alcoholId: string;
  ml: number;
  cost?: number;
}
export interface StockResponse {
  role: Role;
  revision: string;
  catalogRevision: string;
  stock?: StockEntry[];
  unchanged?: boolean;
  partial?: boolean;
  baseRevision?: string;
  historyBefore?: string;
  sale?: Sale | StaffSale;
  warning?: string;
}
export interface CatalogResponse {
  role: Role;
  catalogRevision: string;
  data?: Pick<BarData, 'alcohol' | 'cocktails'>;
  staffData?: StaffData;
  unchanged?: boolean;
}

export type CatalogResource = 'alcohol' | 'cocktails';
export interface CatalogPartResponse {
  resource: CatalogResource;
  role: Role;
  catalogRevision: string;
  unchanged?: boolean;
  alcohol?: BarData['alcohol'];
  cocktails?: BarData['cocktails'];
  ingredients?: StaffData['ingredients'];
  recipes?: StaffData['recipes'];
  products?: StaffData['products'];
}

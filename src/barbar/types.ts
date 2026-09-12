export interface Alcohol {
  id: string;
  name: string;
  category: 'alcohol' | 'mixer';
  unit?: 'ml' | 'g';
  costPerLiter: number;
  pricePerLiter: number;
  color: string;
}
export interface Ingredient {
  alcoholId: string;
  ml: number;
}
export type MenuCategory =
  'cocktail' | 'tincture' | 'shot' | 'set' | 'beer' | 'snack' | 'hot' | 'soft' | 'wine';
export interface Cocktail {
  category?: MenuCategory;
  notes?: string;
  id: string;
  name: string;
  ingredients: Ingredient[];
  price: number;
  image: number;
}
export interface Purchase {
  id: string;
  alcoholId: string;
  date: string;
  ml: number;
  costPerLiter: number;
}
export interface Sale {
  category?: MenuCategory;
  id: string;
  date: string;
  createdAt: string;
  kind: 'alcohol' | 'cocktail';
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  ingredients: (Ingredient & { cost: number })[];
  voided: boolean;
}
export interface StockReset {
  id: string;
  alcoholId: string;
  name: string;
  date: string;
  createdAt: string;
  ml: number;
  cost: number;
}
export interface BarData {
  version: 1;
  alcohol: Alcohol[];
  cocktails: Cocktail[];
  purchases: Purchase[];
  sales: Sale[];
  operations: string[];
  stockResets?: StockReset[];
  archived?: { before: string; ingredients: (Ingredient & { cost: number })[]; count: number };
}
export type Action =
  | { type: 'alcohol'; value: Alcohol }
  | { type: 'cocktail'; value: Cocktail }
  | { type: 'purchase'; value: Purchase }
  | { type: 'sale'; value: { kind: Sale['kind']; productId: string; quantity: number; date: string } }
  | { type: 'void'; saleId: string }
  | { type: 'resetStock'; alcoholId: string; expectedMl: number; expectedCost: number }
  | { type: 'restore'; value: BarData }
  | { type: 'purge'; before: string };
export type Command = Action & { id: string };

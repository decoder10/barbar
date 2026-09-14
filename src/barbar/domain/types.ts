export interface Alcohol {
  id: string;
  name: string;
  category: 'alcohol' | 'mixer' | 'beer' | 'wine' | 'cognac';
  unit?: 'ml' | 'g' | 'bottle';
  bottleSizeMl?: number;
  glassSizeMl?: number;
  glassPrice?: number;
  // Prices are per bottle for bottled drinks; per 1,000 units otherwise.
  costPerLiter: number;
  pricePerLiter: number;
  color: string;
}
export interface Ingredient {
  alcoholId: string;
  ml: number;
}
export type MenuCategory =
  'cocktail' | 'tincture' | 'shot' | 'set' | 'beer' | 'snack' | 'hot' | 'soft' | 'wine' | 'cognac';
export interface PortionExpense {
  alcoholId: string;
  cost: number;
}
export interface Cocktail {
  stockAlcoholId?: string;
  serving?: 'bottle' | 'glass';
  extraCosts?: PortionExpense[];
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
  servingMl?: number;
  unit?: 'bottle' | 'glass';
  extraCosts?: (PortionExpense & { name: string })[];
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
  historyBefore?: string;
  opening?: { ingredients: (Ingredient & { cost: number })[]; mode: 'read-model' };
  stockMovements?: StockMovement[];
  expenses?: BarExpense[];
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
  | OperationsAction
  | { type: 'alcohol'; value: Alcohol }
  | { type: 'cocktail'; value: Cocktail }
  | { type: 'createCocktail'; value: Omit<Cocktail, 'id' | 'price' | 'extraCosts'> }
  | {
      type: 'updateRecipe';
      cocktailId: string;
      ingredients: Ingredient[];
      notes: string;
      expected: { ingredients: Ingredient[]; notes: string };
    }
  | { type: 'purchase'; value: Purchase }
  | { type: 'correctPurchase'; purchaseId: string; expectedMl: number; ml: number }
  | {
      type: 'sale';
      value: {
        kind: Sale['kind'];
        productId: string;
        quantity: number;
        date: string;
        businessDay?: boolean;
        servingMl?: number;
      };
    }
  | { type: 'void'; saleId: string }
  | { type: 'resetStock'; alcoholId: string; expectedMl: number; expectedCost: number }
  | { type: 'restore'; value: BarData }
  | { type: 'purge'; before: string };
export type Command = Action & { id: string };

export type Role = 'admin' | 'barbar';
// Explicit allowlist: staff never receive financial fields or the full ledger.
export interface StaffProduct {
  stockAlcoholId?: string;
  glassSizeMl?: number;
  bottleSizeMl?: number;
  availableMl?: number;
  unit?: 'bottle' | 'glass';
  id: string;
  kind: Sale['kind'];
  name: string;
  category: MenuCategory | 'alcohol';
  image?: number;
  available: number | null;
  ready: boolean;
}
export type StaffSale = Pick<
  Sale,
  | 'id'
  | 'date'
  | 'createdAt'
  | 'kind'
  | 'productId'
  | 'name'
  | 'quantity'
  | 'voided'
  | 'category'
  | 'unit'
  | 'servingMl'
>;
export interface StaffRecipe extends Pick<
  Cocktail,
  'id' | 'name' | 'category' | 'image' | 'notes' | 'ingredients'
> {
  editable: boolean;
  managedIngredientIds: string[];
}
export interface StaffData {
  paged?: boolean;
  recipes: StaffRecipe[];
  ingredients: (Pick<
    Alcohol,
    'id' | 'name' | 'unit' | 'category' | 'bottleSizeMl' | 'glassSizeMl' | 'color'
  > & {
    available: number;
  })[];
  products: StaffProduct[];
  sales: StaffSale[];
  archivedBefore?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  createdAt: string;
  kind: 'count' | 'writeoff' | 'prepare';
  reason: string;
  lines: { alcoholId: string; ml: number; cost: number }[];
  outputId?: string;
  outputQuantity?: number;
  expiresOn?: string;
  counted?: { alcoholId: string; expected: number; actual: number }[];
}
export interface BarExpense {
  id: string;
  date: string;
  category: 'rent' | 'payroll' | 'utilities' | 'marketing' | 'maintenance' | 'other';
  description: string;
  amount: number;
  voided: boolean;
}
export type OperationsAction =
  | {
      type: 'count';
      reason: string;
      lines: { alcoholId: string; expected: number; actual: number; costPerBasis?: number }[];
    }
  | { type: 'writeoff'; reason: string; alcoholId: string; quantity: number; expected: number }
  | {
      type: 'prepare';
      reason: string;
      outputId: string;
      quantity: number;
      ingredients: Ingredient[];
      expiresOn?: string;
    }
  | { type: 'expense'; value: Omit<BarExpense, 'id' | 'voided'> }
  | { type: 'voidExpense'; expenseId: string };

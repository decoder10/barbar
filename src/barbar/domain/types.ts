export interface Alcohol {
  id: string;
  name: string;
  /** `food` holds snack products (bread, cheese, meat, vegetables, sauces). */
  category: 'alcohol' | 'mixer' | 'beer' | 'wine' | 'cognac' | 'food' | 'goods';
  /** Goods only: the menu section of the linked item (soft drinks, snacks, tea bags). */
  menuCategory?: GoodsCategory;
  /** Product group chosen by the owner (fruit, snacks…); derived from the name when absent. */
  group?: string;
  /** Goods only: quantity deducted by one sale, in the item's unit (1 bottle, 1 pc, 50 g). */
  saleAmount?: number;
  unit?: 'ml' | 'g' | 'bottle' | 'pcs';
  bottleSizeMl?: number;
  glassSizeMl?: number;
  glassPrice?: number;
  /** Outside goods and bottles: prices are entered per this package (500 ml, 10 pcs), stored per 1,000 ml/g or 1 pc. */
  packSize?: number;
  // Prices are per bottle for bottled drinks; per 1,000 units otherwise.
  costPerLiter: number;
  pricePerLiter: number;
  color: string;
  /** Poured alcohol is listed in the public guest menu unless hidden. */
  guestHidden?: boolean;
  /** The owner's own photo (`domain/catalog/uploaded-photos.ts`); the library photo otherwise. */
  photo?: string;
  /** Owner's bar-wide favourite: a shortcut in the sales catalog for every role. */
  favorite?: true;
  /** Purchasing (owner only): supplier, own lead time, safety days and safety stock in the item's unit. */
  supplierId?: string;
  leadDays?: number;
  safetyDays?: number;
  safetyStock?: number;
}
export type GoodsCategory = 'soft' | 'snack' | 'hot';
/** One tincture in a set and the number of shots it contributes. */
export interface SetComponent {
  cocktailId: string;
  quantity: number;
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
  /** Sets only: tinctures and shots; a set sale deducts their recipes. */
  components?: SetComponent[];
  /** Sold as is (tea bags, juice): no recipe and no stock deduction. */
  noIngredients?: boolean;
  /** Optional cost per portion in AMD for items without ingredients. */
  portionCost?: number;
  /** Guest-facing portion, e.g. «50 мл» or «6 шотов». */
  portion?: string;
  guestHidden?: boolean;
  /** Owner's bar-wide favourite: a shortcut in the sales catalog for every role. */
  favorite?: true;
  id: string;
  name: string;
  ingredients: Ingredient[];
  price: number;
  image: number;
  /** The owner's own photo; replaces the library photo chosen by `image` wherever the item is shown. */
  photo?: string;
}
/** A supplier and its default delivery time; an item may override it. */
export interface Supplier {
  id: string;
  name: string;
  leadDays?: number;
  note?: string;
}
/** One saved selling-price change; prices are never changed automatically. */
export interface PriceChange {
  id: string;
  /** Business day of the change. */
  date: string;
  createdAt: string;
  kind: Sale['kind'];
  productId: string;
  name: string;
  /** `price` for a menu item, `pricePerLiter` for poured alcohol (per 1,000 ml). */
  field: 'price' | 'pricePerLiter';
  from: number;
  to: number;
  actor?: OrderActor;
}
/** The part of a consumed quantity that came from one preparation batch. */
export interface BatchShare {
  id: string;
  ml: number;
  cost: number;
}
export type SaleIngredient = Ingredient & { cost: number; batches?: BatchShare[] };
export interface Purchase {
  id: string;
  alcoholId: string;
  date: string;
  ml: number;
  costPerLiter: number;
}
export interface Sale {
  /** The open receipt this line was added to; absent for a standalone sale. */
  orderId?: string;
  servingMl?: number;
  unit?: 'bottle' | 'glass' | 'pcs';
  extraCosts?: (PortionExpense & { name: string })[];
  category?: MenuCategory;
  /** Menu item sold without ingredients; cost is the saved portion cost. */
  withoutIngredients?: boolean;
  id: string;
  date: string;
  createdAt: string;
  kind: 'alcohol' | 'cocktail';
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  ingredients: SaleIngredient[];
  voided: boolean;
}
/** A guest table; `code` is the unguessable part of its QR link. */
export interface BarTable {
  id: string;
  name: string;
  order: number;
  active: boolean;
  code: string;
}
/** Identifier of a method from `config/payment-methods.json`. */
export type PaymentMethod = string;
export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  /** Cash handed over, when it differs from the amount; the change is the difference. */
  receivedCash?: number;
}
export type OrderStatus = 'open' | 'paid' | 'cancelled';
export interface OrderActor {
  id: string;
  fullName: string;
}
/**
 * A receipt: groups the sales added with its `orderId`. Lines are the sales themselves, so stock,
 * costs, cancellations and reports keep working on sales; the order adds table, payment and status.
 */
export interface Order {
  id: string;
  tableId?: string;
  status: OrderStatus;
  businessDay: string;
  openedAt: string;
  openedBy?: OrderActor;
  closedAt?: string;
  closedBy?: OrderActor;
  /** Revenue of active lines at closing; frozen with the payments. */
  total?: number;
  payments?: OrderPayment[];
  note?: string;
}
export interface Shift {
  id: string;
  businessDay: string;
  closedAt: string;
  closedBy?: OrderActor;
  count: number;
  revenue: number;
  payments: Record<string, number>;
  countedCash: number;
  difference: number;
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
  tables?: BarTable[];
  orders?: Order[];
  shifts?: Shift[];
  suppliers?: Supplier[];
  priceChanges?: PriceChange[];
  /**
   * Working copies only, never stored: the preparations (and their batch write-offs) of the outputs a
   * command consumes. `stockMovements` must not carry them, because balances already include them.
   */
  batchSources?: StockMovement[];
  archived?: { before: string; ingredients: (Ingredient & { cost: number })[]; count: number };
}
export type Action =
  | { type: 'closeShift'; businessDay: string; expected: string; countedCash: number }
  | { type: 'acceptGuestRequest'; requestId: string; lineIds: string[] }
  | {
      type: 'addLines';
      /** An open order, or a table whose open order is used (opened when it has none). */
      orderId?: string;
      tableId?: string;
      lines: { kind: Sale['kind']; productId: string; quantity: number; servingMl?: number }[];
      /** The total the client showed; changed prices are refused instead of charged blindly. */
      expectedTotal: number;
    }
  | { type: 'correctBatchYield'; batchId: string; expected: number; actual: number; reason: string }
  | { type: 'setFavorite'; kind: Sale['kind']; productId: string; favorite: boolean }
  | { type: 'saveSupplier'; value: Supplier }
  | { type: 'removeSupplier'; supplierId: string }
  | { type: 'rejectGuestRequest'; requestId: string }
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
        /** Adds the sale as a line of an open order; the order's business day is not changed. */
        orderId?: string;
      };
    }
  | { type: 'void'; saleId: string }
  /** Takes a line off an open receipt: the one cancellation a worker may make. */
  | { type: 'removeLine'; saleId: string }
  | { type: 'saveTable'; value: Pick<BarTable, 'id' | 'name' | 'order' | 'active'>; newCode?: boolean }
  | { type: 'removeTable'; tableId: string }
  | { type: 'openOrder'; tableId?: string }
  | {
      type: 'payOrder';
      orderId: string;
      /** Total the client showed; a changed receipt is refused instead of paid blindly. */
      expectedTotal: number;
      payments: { method: PaymentMethod; amount: number; receivedCash?: number }[];
    }
  | { type: 'cancelOrder'; orderId: string }
  | { type: 'resetStock'; alcoholId: string; expectedMl: number; expectedCost: number }
  | { type: 'restore'; value: BarData }
  | { type: 'purge'; before: string };
export type Command = Action & { id: string };
/** Who runs a command; the server resolves it from the session, never from the request body. */
export interface CommandContext {
  actor?: OrderActor;
}

export type Role = 'admin' | 'barbar';
// Explicit allowlist: staff can read selling prices/revenue, never costs or the full ledger.
export interface StaffProduct {
  /** Selling price in AMD per menu portion, or per ml for poured alcohol. */
  price?: number;
  /** The owner's bar-wide favourite. */
  favorite?: true;
  stockAlcoholId?: string;
  glassSizeMl?: number;
  bottleSizeMl?: number;
  availableMl?: number;
  unit?: 'bottle' | 'glass' | 'pcs';
  /** Menu serving of stock-linked items; chooses the same photo as the owner card. */
  serving?: Cocktail['serving'];
  id: string;
  kind: Sale['kind'];
  name: string;
  category: MenuCategory | 'alcohol';
  image?: number;
  photo?: string;
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
  | 'revenue'
  | 'orderId'
>;
export interface StaffRecipe extends Pick<
  Cocktail,
  'id' | 'name' | 'category' | 'image' | 'photo' | 'notes' | 'ingredients' | 'noIngredients' | 'components'
> {
  editable: boolean;
  managedIngredientIds: string[];
}
export interface StaffData {
  paged?: boolean;
  recipes: StaffRecipe[];
  ingredients: (Pick<
    Alcohol,
    | 'id'
    | 'name'
    | 'unit'
    | 'category'
    | 'bottleSizeMl'
    | 'glassSizeMl'
    | 'color'
    | 'menuCategory'
    | 'group'
    | 'photo'
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
  /** Actual yield of a preparation. */
  outputQuantity?: number;
  /** Planned yield; the loss is the plan minus the actual yield. */
  plannedQuantity?: number;
  /** A write-off aimed at one preparation batch. */
  batchId?: string;
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
  | {
      type: 'writeoff';
      reason: string;
      alcoholId: string;
      quantity: number;
      expected: number;
      /** Writes off a given batch of a preparation and takes that batch's unit cost. */
      batchId?: string;
    }
  | {
      type: 'prepare';
      reason: string;
      outputId: string;
      /** Actual yield. */
      quantity: number;
      plannedQuantity?: number;
      ingredients: Ingredient[];
      expiresOn?: string;
    }
  | { type: 'expense'; value: Omit<BarExpense, 'id' | 'voided'> }
  | { type: 'voidExpense'; expenseId: string };

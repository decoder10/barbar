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

import { useMemo } from 'react';
import { inventoryCalculations } from '../../domain/inventory-calculations';
import type { BarData } from '../../domain/types';
export function useInventoryCalculations(data: BarData) {
  return useMemo(() => inventoryCalculations(data), [data]);
}

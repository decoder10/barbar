import type { ForecastRow, ParameterSource } from './purchasing';

const number = (n: number) => String(Math.round(n * 100) / 100);
/** Where a parameter came from, in words for the owner. */
export const sourceLabel: Record<ParameterSource, string> = {
  item: 'у позиции',
  supplier: 'у поставщика',
  default: 'по умолчанию',
};
export interface ForecastExplanation {
  /** «расход × доля × (срок + запас) + резерв − остаток = итог», with the numbers filled in. */
  formula: string;
  facts: { label: string; value: string }[];
}

/**
 * How a recommended quantity was reached. The formula is the calculation itself: daily use per worked
 * day, scaled by the share of days the bar worked, over the lead time plus the safety days, plus the fixed
 * safety stock, minus what is in stock.
 */
export function explainForecast(row: ForecastRow, unit: string): ForecastExplanation {
  const u = unit ? ` ${unit}` : '';
  return {
    formula:
      `${number(row.daily)}${u}/раб. день × ${number(row.workShare)} × ` +
      `(${row.leadDays} + ${row.safetyDays}) дн. + ${number(row.safetyStock)}${u} − ${number(row.available)}${u}` +
      ` = ${number(Math.max(0, row.target - row.available))}${u}` +
      (row.suggested !== Math.max(0, row.target - row.available) ? ` → ${number(row.suggested)}${u}` : ''),
    facts: [
      { label: 'Расход за период', value: `${number(row.consumed)}${u}` },
      { label: 'Дней в наличии (база расхода)', value: String(row.basisDays) },
      {
        label: 'Рабочих дней из дней периода',
        value: row.workedDays === null ? '—' : `${row.workedDays} / ${row.days}`,
      },
      { label: 'Ожидаемый расход в день', value: `${number(row.expectedDaily)}${u}` },
      { label: 'Срок поставки', value: `${row.leadDays} дн. (${sourceLabel[row.leadSource]})` },
      {
        label: 'Страховой запас',
        value: `${row.safetyDays} дн. (${sourceLabel[row.safetySource]}) + ${number(row.safetyStock)}${u}`,
      },
      { label: 'Нужно к приходу', value: `${number(row.target)}${u}` },
      { label: 'Остаток сейчас', value: `${number(row.available)}${u}` },
    ],
  };
}

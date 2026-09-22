/** Ledger rounding to whole luma: the one definition every total, price and payment uses. */
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

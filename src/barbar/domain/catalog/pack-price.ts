import { barConfig } from '../../config';
import { priceUnit, round, unitBasis, unitLabel } from '../model';
import type { Alcohol } from '../types';

type PackSource = Pick<Alcohol, 'category' | 'unit' | 'packSize'>;

/** Millilitres, grams and pieces outside goods may be priced per package; bottles and goods keep their unit. */
export const packPriced = (item: Pick<Alcohol, 'category' | 'unit'>) =>
  item.category !== 'goods' && item.unit !== 'bottle';

/** Package buttons for the item's unit: 250–1,000 ml or g, 1–20 pieces. */
export const packPresets = (unit?: Alcohol['unit']) =>
  unitBasis(unit) === 1 ? barConfig.presets.packSizes.pcs : barConfig.presets.packSizes.volume;

/** The amount prices are entered for: the package (500 ml) or the stored basis (1,000 ml/g, 1 pc, 1 bottle). */
export const priceAmount = (item?: PackSource) =>
  item?.packSize && packPriced(item) ? item.packSize : unitBasis(item?.unit);

/** A price entered for the package, as stored: per 1,000 ml/g or per piece, at ledger precision. */
export const toStoredPrice = (entered: number, item?: PackSource) =>
  round((entered * unitBasis(item?.unit)) / priceAmount(item));

/** A stored price shown for the package the owner buys. */
export const toShownPrice = (stored: number, item?: PackSource) =>
  round((stored * priceAmount(item)) / unitBasis(item?.unit));

/** «500 мл» or «10 шт.» for a package, otherwise the stored basis label («1 000 мл», «1 шт.»). */
export const packPriceUnit = (item?: PackSource) =>
  item?.packSize && packPriced(item) && item.packSize !== unitBasis(item.unit)
    ? `${item.packSize} ${unitLabel(item.unit)}`
    : priceUnit(item?.unit);

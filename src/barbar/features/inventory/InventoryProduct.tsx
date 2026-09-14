import type { ReactNode } from 'react';
import type { Alcohol } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { BottleArt } from '../catalog/art';

export function InventoryProduct({
  drink,
}: {
  drink: Pick<Alcohol, 'name' | 'category' | 'color' | 'bottleSizeMl'>;
}) {
  const label =
    drink.category === 'beer'
      ? 'Пиво'
      : drink.category === 'wine'
        ? 'Вино'
        : drink.category === 'cognac'
          ? 'Коньяк'
          : drink.category === 'mixer'
            ? 'Продукт / миксер'
            : 'Алкоголь';
  return (
    <div className="table-product">
      <BottleArt drink={drink} />
      <span>
        <strong>{t(drink.name)}</strong>
        <small>
          {t(label)}
          {t(drink.bottleSizeMl ? ` · ${drink.bottleSizeMl} мл/бут.` : '')}
        </small>
      </span>
    </div>
  );
}

export function InventoryStock({
  quantity,
  unavailable,
  low,
  children,
}: {
  quantity: string;
  unavailable: boolean;
  low: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <span className={`stock-pill ${low ? 'low' : ''}`}>{t(quantity)}</span>
      {unavailable && <span className="stock-unavailable-label">{t('Нет в наличии')}</span>}
      {children}
    </>
  );
}

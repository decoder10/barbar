import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { FormSteps } from '../../ui/form-steps';
import { money, priceUnit, uid, unitBasis, unitLabel } from '../../domain/model';
import {
  packPresets,
  packPriceUnit,
  packPriced,
  priceAmount,
  toShownPrice,
  toStoredPrice,
} from '../../domain/catalog/pack-price';
import type { Alcohol } from '../../domain/types';
import { barConfig } from '../../config';
import {
  categoryForGroup,
  goodsMenuCategoryForGroup,
  inventoryGroup,
  inventoryGroupHints,
  inventoryGroups,
  isAlcoholGroup,
  unitForGroup,
} from '../../domain/inventory-groups';
import { withPhoto } from '../../domain/catalog/uploaded-photos';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';
import { BottleArt } from '../catalog/art';
import { OwnPhotoField } from '../catalog/media/OwnPhotoField';

export function AlcoholForm({
  alcohol,
  initialCategory = 'alcohol',
  close,
}: {
  alcohol?: Alcohol;
  initialCategory?: Alcohol['category'];
  close: () => void;
}) {
  const { data, run } = useBar();
  // Poured alcohol has its own price history; other items are sold through their linked menu item.
  const priceHistoryTarget = alcohol
    ? alcohol.category === 'alcohol'
      ? `alcohol:${alcohol.id}`
      : (() => {
          const linked = data.cocktails.find((c) => c.stockAlcoholId === alcohol.id && c.serving !== 'glass');
          return linked ? `cocktail:${linked.id}` : undefined;
        })()
    : undefined;
  const [value, setValue] = useState<Alcohol>(
    alcohol || {
      id: uid(),
      name: '',
      category: initialCategory,
      unit:
        initialCategory === 'goods'
          ? 'pcs'
          : isAlcoholGroup(initialCategory)
            ? unitForGroup(initialCategory)
            : 'ml',
      ...(initialCategory === 'goods' ? { menuCategory: 'soft' as const } : {}),
      costPerLiter: 0,
      pricePerLiter: 0,
      color: '#8c775b',
    },
  );
  // Price fields keep what the owner typed for the package (700 ֏ for 500 ml); saving stores per 1,000 or 1 pc.
  const [prices, setPrices] = useState(() => ({
    cost: String(alcohol ? toShownPrice(alcohol.costPerLiter, alcohol) : 0),
    sale: String(alcohol ? toShownPrice(alcohol.pricePerLiter, alcohol) : 0),
  }));
  const stored = {
    costPerLiter: toStoredPrice(Number(prices.cost), value),
    pricePerLiter: toStoredPrice(Number(prices.sale), value),
  };
  const pack = packPriced(value);
  const packed = priceAmount(value) !== unitBasis(value.unit);
  const bottled = value.unit === 'bottle' && value.category !== 'goods';
  const group = inventoryGroup(value);
  const goods = value.category === 'goods';
  const pourable = ['wine', 'cognac'].includes(value.category);
  const used =
    !!alcohol &&
    (data.purchases.some((p) => p.alcoholId === alcohol.id) ||
      data.cocktails.some((c) => c.ingredients.some((i) => i.alcoholId === alcohol.id)));
  // A purchased bottle or piece keeps its volume; bottles and pieces share the size buttons.
  const volumeLocked = !!alcohol?.bottleSizeMl && data.purchases.some((p) => p.alcoholId === alcohol.id);
  const volumeButtons = (
    <div className="quick-values bottle-sizes">
      {barConfig.presets.bottleSizesMl.map((n) => (
        <button
          type="button"
          key={n}
          className={value.bottleSizeMl === n ? 'selected' : ''}
          aria-pressed={value.bottleSizeMl === n}
          disabled={volumeLocked}
          onClick={() => setValue({ ...value, bottleSizeMl: n })}
        >
          {n} {t('мл')}
        </button>
      ))}
    </div>
  );
  return (
    <Modal
      title={t(
        value.category === 'food'
          ? alcohol
            ? 'Настройки продукта'
            : 'Новый продукт для закусок'
          : alcohol
            ? 'Настройки напитка'
            : 'Новый напиток',
      )}
      subtitle={
        bottled
          ? 'У каждой марки свои цены и остаток в бутылках.'
          : packed
            ? 'Закупочная и продажная цены указываются за выбранную фасовку.'
            : value.unit === 'pcs'
              ? 'Закупочная и продажная цены указываются за 1 штуку.'
              : 'Закупочная и продажная цены указываются за 1 000 мл или граммов.'
      }
      close={close}
    >
      <FormSteps
        onSubmit={async (e) => {
          e.preventDefault();
          // A package only applies to its own unit; switching to bottles or goods drops it.
          const { packSize, ...rest } = value;
          const saved = { ...rest, ...(pack && packSize ? { packSize } : {}), ...stored };
          if (await run({ type: 'alcohol', value: saved }, 'Напиток сохранён в справочнике.')) {
            close();
          }
        }}
        submit={<Submit />}
        steps={[
          {
            title: 'Основное',
            content: (
              <>
                <Field label={bottled ? 'Марка и название' : 'Название'}>
                  <input
                    required
                    maxLength={bottled ? 65 : 80}
                    placeholder={t(
                      bottled ? 'Например, Guinness 0,5 л или Ararat 5 лет' : 'Например, Bacardi белый',
                    )}
                    value={value.name}
                    onChange={(e) => setValue({ ...value, name: e.target.value })}
                  />
                </Field>
                <div className="photo-picker own-photo-stock">
                  <div className="photo-picker-readonly">
                    <span className="photo-picker-preview" aria-hidden="true">
                      <BottleArt drink={value} />
                    </span>
                    <span className="photo-picker-text">
                      <strong>{t('Изображение')}</strong>
                      <small>{t(value.photo ? 'Своё фото' : 'Из библиотеки')}</small>
                    </span>
                  </div>
                  <OwnPhotoField
                    photo={value.photo}
                    onChange={(photo) => setValue((current) => withPhoto(current, photo))}
                  />
                </div>
                <Field label="Группа" hint={inventoryGroupHints[group]}>
                  <select
                    value={group}
                    disabled={used && isAlcoholGroup(value.category)}
                    onChange={(e) => {
                      const next = e.target.value;
                      const alcoholType = isAlcoholGroup(next);
                      setValue({
                        ...value,
                        group: alcoholType ? undefined : next,
                        ...(used
                          ? {}
                          : {
                              category: alcoholType
                                ? categoryForGroup(next)
                                : goods
                                  ? 'goods'
                                  : categoryForGroup(next),
                              // Units per group come from config/inventory-groups.json; a chosen unit is kept.
                              unit: alcoholType
                                ? unitForGroup(next)
                                : goods
                                  ? value.unit || unitForGroup(next, true)
                                  : value.unit && value.unit !== 'bottle'
                                    ? value.unit
                                    : unitForGroup(next),
                              ...(alcoholType ? { menuCategory: undefined, saleAmount: undefined } : {}),
                              glassSizeMl: undefined,
                              glassPrice: undefined,
                              packSize: undefined,
                            }),
                      });
                    }}
                  >
                    {inventoryGroups.map(([id, label]) => (
                      <option key={id} value={id}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </Field>
                {!isAlcoholGroup(group) && (
                  <label className="form-help guest-visibility">
                    <input
                      type="checkbox"
                      checked={goods}
                      disabled={used}
                      onChange={(e) =>
                        setValue(
                          e.target.checked
                            ? {
                                ...value,
                                group,
                                category: 'goods',
                                unit: unitForGroup(group, true),
                                menuCategory: goodsMenuCategoryForGroup(group),
                              }
                            : {
                                ...value,
                                group,
                                category: categoryForGroup(group),
                                unit: unitForGroup(group),
                                menuCategory: undefined,
                                saleAmount: undefined,
                              },
                        )
                      }
                    />
                    {t(' Продаётся целиком в меню (бутылка, пачка, пакетик, порция)')}
                  </label>
                )}
                {goods && (
                  <div className="form-grid">
                    <Field label="Раздел меню">
                      <select
                        disabled={used}
                        value={value.menuCategory || 'soft'}
                        onChange={(e) =>
                          setValue({
                            ...value,
                            menuCategory: e.target.value as NonNullable<Alcohol['menuCategory']>,
                          })
                        }
                      >
                        <option value="soft">{t('Безалкогольные')}</option>
                        <option value="snack">{t('Закуски')}</option>
                        <option value="hot">{t('Горячие напитки')}</option>
                      </select>
                    </Field>
                    <Field label="Учёт на складе">
                      <select
                        disabled={used}
                        value={value.unit || 'pcs'}
                        onChange={(e) => {
                          const unit = e.target.value as Alcohol['unit'];
                          setValue({
                            ...value,
                            unit,
                            saleAmount: unit === 'g' || unit === 'ml' ? value.saleAmount : undefined,
                            bottleSizeMl: unit === 'g' || unit === 'ml' ? undefined : value.bottleSizeMl,
                          });
                        }}
                      >
                        <option value="bottle">{t('Бутылки')}</option>
                        <option value="pcs">{t('Штуки (пачки, пакетики)')}</option>
                        <option value="g">{t('Граммы')}</option>
                        <option value="ml">{t('Миллилитры')}</option>
                      </select>
                    </Field>
                  </div>
                )}
                {!goods && !isAlcoholGroup(group) && (
                  <Field label="Единица измерения">
                    <select
                      disabled={used}
                      value={value.unit || 'ml'}
                      onChange={(e) =>
                        setValue({ ...value, unit: e.target.value as Alcohol['unit'], packSize: undefined })
                      }
                    >
                      <option value="ml">{t('Миллилитры (жидкости)')}</option>
                      <option value="g">{t('Граммы (фрукты, сахар, специи)')}</option>
                      <option value="pcs">{t('Штуки (хлеб, лаваш, упаковки)')}</option>
                    </select>
                  </Field>
                )}
              </>
            ),
          },
          {
            title: 'Цены и объём',
            content: (
              <>
                {goods &&
                  (value.unit === 'g' || value.unit === 'ml' ? (
                    <Field
                      label={`Списывать за одну продажу, ${unitLabel(value.unit)}`}
                      hint="Например, порция мёда — 50 г. Столько спишется со склада при каждой продаже."
                    >
                      <input
                        type="number"
                        min="0.01"
                        max="100000"
                        step="0.01"
                        required
                        value={value.saleAmount || ''}
                        onChange={(e) =>
                          setValue({ ...value, saleAmount: Number(e.target.value) || undefined })
                        }
                      />
                    </Field>
                  ) : (
                    <>
                      <Field
                        label="Объём 1 шт., мл"
                        hint="Каждая продажа списывает 1 шт. Объём нужен, только если товар идёт в коктейли в мл."
                      >
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          disabled={volumeLocked}
                          value={value.bottleSizeMl || ''}
                          onChange={(e) =>
                            setValue({ ...value, bottleSizeMl: Number(e.target.value) || undefined })
                          }
                        />
                      </Field>
                      {volumeButtons}
                    </>
                  ))}
                {pack && (
                  <>
                    <Field
                      label={`Фасовка, ${unitLabel(value.unit)}`}
                      hint="Цены ниже указываются за это количество. Остаток и рецепты считаются как раньше."
                    >
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        placeholder={String(unitBasis(value.unit))}
                        value={value.packSize || ''}
                        onChange={(e) =>
                          setValue({ ...value, packSize: Number(e.target.value) || undefined })
                        }
                      />
                    </Field>
                    <div className="quick-values pack-sizes">
                      {packPresets(value.unit).map((n) => (
                        <button
                          type="button"
                          key={n}
                          className={priceAmount(value) === n ? 'selected' : ''}
                          aria-pressed={priceAmount(value) === n}
                          onClick={() => setValue({ ...value, packSize: n })}
                        >
                          {n} {t(unitLabel(value.unit))}
                        </button>
                      ))}
                    </div>
                    {!isAlcoholGroup(group) && (
                      <p className="form-help">
                        {t(
                          'Упаковка продаётся в меню целиком, а в коктейли идёт по мл? Отметьте «Продаётся целиком» на первом шаге и укажите объём 1 шт.',
                        )}
                      </p>
                    )}
                  </>
                )}
                <div className="form-grid">
                  <Field label={`Закупка за ${packPriceUnit(value)}, ֏`}>
                    <input
                      type="number"
                      min="0"
                      max="1000000000"
                      step="0.01"
                      required
                      value={prices.cost}
                      placeholder="0"
                      onChange={(e) => setPrices({ ...prices, cost: e.target.value })}
                    />
                  </Field>
                  <Field label={goods ? 'Цена продажи, ֏' : `Продажа за ${packPriceUnit(value)}, ֏`}>
                    <input
                      type="number"
                      min="0"
                      max="1000000000"
                      step="0.01"
                      required
                      value={prices.sale}
                      placeholder="0"
                      onChange={(e) => setPrices({ ...prices, sale: e.target.value })}
                    />
                  </Field>
                </div>
                {packed && (
                  <p className="form-help pack-price-basis">
                    {t('В пересчёте за ')}
                    {t(priceUnit(value.unit))}
                    {t(': закупка ')}
                    {money(stored.costPerLiter)}
                    {t(', продажа ')}
                    {money(stored.pricePerLiter)}.
                  </p>
                )}
                {alcohol && priceHistoryTarget && (
                  <Link
                    className="text-link price-history-link"
                    to={`/reports?price=${priceHistoryTarget}`}
                    onClick={close}
                  >
                    {t('История цен')}
                  </Link>
                )}
                {bottled && (
                  <>
                    <Field
                      label="Объём бутылки, мл"
                      hint="Для другого объёма той же марки создайте отдельную позицию."
                    >
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        required={pourable}
                        placeholder={t('Например, 750')}
                        disabled={volumeLocked}
                        value={value.bottleSizeMl || ''}
                        onChange={(e) =>
                          setValue({ ...value, bottleSizeMl: Number(e.target.value) || undefined })
                        }
                      />
                    </Field>
                    {volumeButtons}
                  </>
                )}
                {t(
                  pourable && (
                    <>
                      <div className="form-grid">
                        <Field
                          label={value.category === 'wine' ? 'Объём бокала, мл' : 'Объём порции, мл'}
                          hint="Оставьте пустым, если продаёте только бутылками."
                        >
                          <input
                            list="glass-sizes"
                            type="number"
                            min="1"
                            max={value.bottleSizeMl || 10000}
                            step="1"
                            value={value.glassSizeMl || ''}
                            onChange={(e) =>
                              setValue({ ...value, glassSizeMl: Number(e.target.value) || undefined })
                            }
                          />
                        </Field>
                        <Field
                          label={value.category === 'wine' ? 'Продажа за бокал, ֏' : 'Продажа за порцию, ֏'}
                        >
                          <input
                            type="number"
                            min="0"
                            max="1000000000"
                            step="0.01"
                            value={value.glassPrice || ''}
                            onChange={(e) => setValue({ ...value, glassPrice: Number(e.target.value) })}
                          />
                        </Field>
                      </div>
                      {t(
                        !!value.glassSizeMl && !!value.bottleSizeMl && (
                          <p className="form-help">
                            {t('Одна порция: ')}
                            {t(value.glassSizeMl)}
                            {t(' мл из бутылки ')}
                            {t(value.bottleSizeMl)}
                            {t(' мл. Остаток списывается автоматически.')}
                          </p>
                        ),
                      )}
                    </>
                  ),
                )}
                <datalist id="glass-sizes">
                  {t(barConfig.presets.glassSizesMl.map((n) => <option key={n} value={n} />))}
                </datalist>
                <p className="form-help">
                  {t(
                    'Создание напитка не пополняет склад. После сохранения добавьте закупку. Новые цены не изменяют прошлые продажи.',
                  )}
                </p>
              </>
            ),
          },
        ]}
      />
    </Modal>
  );
}

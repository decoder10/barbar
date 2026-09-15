import { useState } from 'react';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { priceUnit, uid, unitLabel } from '../../domain/model';
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
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';

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
  const bottled = value.unit === 'bottle' && value.category !== 'goods';
  const group = inventoryGroup(value);
  const goods = value.category === 'goods';
  const pourable = ['wine', 'cognac'].includes(value.category);
  const used =
    !!alcohol &&
    (data.purchases.some((p) => p.alcoholId === alcohol.id) ||
      data.cocktails.some((c) => c.ingredients.some((i) => i.alcoholId === alcohol.id)));
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
          : value.unit === 'pcs'
            ? 'Закупочная и продажная цены указываются за 1 штуку.'
            : 'Закупочная и продажная цены указываются за 1 000 мл или граммов.'
      }
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ type: 'alcohol', value }, 'Напиток сохранён в справочнике.')) {
            close();
          }
        }}
      >
        <Field label={bottled ? 'Марка и название' : 'Название'}>
          <input
            required
            maxLength={bottled ? 65 : 80}
            placeholder={t(bottled ? 'Например, Guinness 0,5 л или Ararat 5 лет' : 'Например, Bacardi белый')}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
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
          <>
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
            {value.unit === 'g' || value.unit === 'ml' ? (
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
                  onChange={(e) => setValue({ ...value, saleAmount: Number(e.target.value) || undefined })}
                />
              </Field>
            ) : (
              <Field
                label="Объём 1 шт., мл"
                hint="Каждая продажа списывает 1 шт. Объём нужен, только если товар идёт в коктейли в мл."
              >
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  disabled={!!alcohol?.bottleSizeMl && data.purchases.some((p) => p.alcoholId === alcohol.id)}
                  value={value.bottleSizeMl || ''}
                  onChange={(e) => setValue({ ...value, bottleSizeMl: Number(e.target.value) || undefined })}
                />
              </Field>
            )}
          </>
        )}
        {!goods && !isAlcoholGroup(group) && (
          <Field label="Единица измерения">
            <select
              disabled={used}
              value={value.unit || 'ml'}
              onChange={(e) => setValue({ ...value, unit: e.target.value as Alcohol['unit'] })}
            >
              <option value="ml">{t('Миллилитры (жидкости)')}</option>
              <option value="g">{t('Граммы (фрукты, сахар, специи)')}</option>
              <option value="pcs">{t('Штуки (хлеб, лаваш, упаковки)')}</option>
            </select>
          </Field>
        )}
        <div className="form-grid">
          <Field label={`Закупка за ${priceUnit(value.unit)}, ֏`}>
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              value={value.costPerLiter}
              placeholder="0"
              onChange={(e) => setValue({ ...value, costPerLiter: Number(e.target.value) })}
            />
          </Field>
          <Field label={goods ? 'Цена продажи, ֏' : `Продажа за ${priceUnit(value.unit)}, ֏`}>
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              value={value.pricePerLiter}
              placeholder="0"
              onChange={(e) => setValue({ ...value, pricePerLiter: Number(e.target.value) })}
            />
          </Field>
        </div>
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
                disabled={!!alcohol?.bottleSizeMl && data.purchases.some((p) => p.alcoholId === alcohol.id)}
                value={value.bottleSizeMl || ''}
                onChange={(e) => setValue({ ...value, bottleSizeMl: Number(e.target.value) || undefined })}
              />
            </Field>
            <div className="quick-values bottle-sizes">
              {barConfig.presets.bottleSizesMl.map((n) => (
                <button
                  type="button"
                  key={n}
                  className={value.bottleSizeMl === n ? 'selected' : ''}
                  aria-pressed={value.bottleSizeMl === n}
                  disabled={!!alcohol?.bottleSizeMl && data.purchases.some((p) => p.alcoholId === alcohol.id)}
                  onClick={() => setValue({ ...value, bottleSizeMl: n })}
                >
                  {n} {t('мл')}
                </button>
              ))}
            </div>
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
                    onChange={(e) => setValue({ ...value, glassSizeMl: Number(e.target.value) || undefined })}
                  />
                </Field>
                <Field label={value.category === 'wine' ? 'Продажа за бокал, ֏' : 'Продажа за порцию, ֏'}>
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
        <Submit />
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { Field } from '../../ui/fields';
import { Modal, Submit } from '../../ui/modal';
import { priceUnit, uid } from '../../domain/model';
import type { Alcohol } from '../../domain/types';
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
      unit: ['beer', 'wine', 'cognac'].includes(initialCategory) ? 'bottle' : 'ml',
      costPerLiter: 0,
      pricePerLiter: 0,
      color: '#8c775b',
    },
  );
  const [customSize, setCustomSize] = useState(false);
  const bottled = value.unit === 'bottle';
  const pourable = ['wine', 'cognac'].includes(value.category);
  const used =
    !!alcohol &&
    (data.purchases.some((p) => p.alcoholId === alcohol.id) ||
      data.cocktails.some((c) => c.ingredients.some((i) => i.alcoholId === alcohol.id)));
  return (
    <Modal
      title={t(alcohol ? 'Настройки напитка' : 'Новый напиток')}
      subtitle={
        bottled
          ? 'У каждой марки свои цены и остаток в бутылках.'
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
        <Field label="Тип">
          <select
            value={value.category}
            disabled={used}
            onChange={(e) =>
              setValue({
                ...value,
                category: e.target.value as Alcohol['category'],
                unit: ['beer', 'wine', 'cognac'].includes(e.target.value)
                  ? 'bottle'
                  : e.target.value === 'alcohol' || value.unit === 'bottle'
                    ? 'ml'
                    : value.unit,
                bottleSizeMl: undefined,
                glassSizeMl: undefined,
                glassPrice: undefined,
              })
            }
          >
            <option value="alcohol">{t('Алкоголь')}</option>
            <option value="beer">{t('Пиво')}</option>
            <option value="wine">{t('Вино')}</option>
            <option value="cognac">{t('Коньяк')}</option>
            <option value="mixer">{t('Продукты и миксеры (без алкоголя)')}</option>
          </select>
        </Field>
        <Field label="Единица измерения">
          <select
            disabled={value.category !== 'mixer' || used}
            value={value.unit || 'ml'}
            onChange={(e) => setValue({ ...value, unit: e.target.value as Alcohol['unit'] })}
          >
            {t(bottled && <option value="bottle">{t('Бутылки')}</option>)}
            <option value="ml">{t('Миллилитры (жидкости)')}</option>
            <option value="g">{t('Граммы (фрукты, сахар, специи)')}</option>
          </select>
        </Field>
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
          <Field label={`Продажа за ${priceUnit(value.unit)}, ֏`}>
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
        {t(
          bottled && (
            <Field
              label="Объём бутылки, мл"
              hint="Для другого объёма той же марки создайте отдельную позицию."
            >
              <select
                aria-label={t('Объём бутылки, мл')}
                required={pourable}
                disabled={!!alcohol?.bottleSizeMl && data.purchases.some((p) => p.alcoholId === alcohol.id)}
                value={customSize ? 'custom' : value.bottleSizeMl || ''}
                onChange={(e) => {
                  setCustomSize(e.target.value === 'custom');
                  if (e.target.value !== 'custom')
                    setValue({ ...value, bottleSizeMl: Number(e.target.value) || undefined });
                }}
              >
                <option value="">{t('Выберите объём')}</option>
                {t(
                  [
                    300,
                    330,
                    500,
                    700,
                    750,
                    1000,
                    ...(value.bottleSizeMl && ![300, 330, 500, 700, 750, 1000].includes(value.bottleSizeMl)
                      ? [value.bottleSizeMl]
                      : []),
                  ].map((n) => (
                    <option key={n} value={n}>
                      {t(n)}
                      {t(' мл')}
                    </option>
                  )),
                )}
                <option value="custom">{t('Другой объём')}</option>
              </select>
            </Field>
          ),
        )}
        {t(
          bottled && customSize && (
            <input
              aria-label={t('Другой объём бутылки, мл')}
              type="number"
              min="1"
              max="10000"
              step="1"
              required
              value={value.bottleSizeMl || ''}
              onChange={(e) => setValue({ ...value, bottleSizeMl: Number(e.target.value) || undefined })}
            />
          ),
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
          {t([30, 50, 100, 125, 150, 175, 200].map((n) => <option key={n} value={n} />))}
        </datalist>
        <Field label="Цвет бутылки">
          <input
            type="color"
            value={value.color}
            onChange={(e) => setValue({ ...value, color: e.target.value })}
          />
        </Field>
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

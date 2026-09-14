import { expect, test, vi } from 'vitest';
import { configureMoney, displayCurrency, formatMoney } from './display-money';
import en from './i18n/en.json';
import hy from './i18n/hy.json';
import { setTranslations, t } from './i18n/runtime';
test('translates controls and dynamic units while preserving names and confirmation tokens', () => {
  vi.stubGlobal('document', { documentElement: { lang: 'ru' } });
  try {
    setTranslations('en', en);
    expect(t('Продажи')).toBe('Sales');
    expect(t('2 порц.')).toBe('2 servings');
    expect(t('Грач')).toBe('Грач');
    expect(t('Для подтверждения напишите СБРОС')).toContain('СБРОС');
    setTranslations('hy', hy);
    expect(t('Продажи')).toBe('Վաճառքներ');
    expect(t('Склад')).toBe('Պահեստ');
    setTranslations('ru');
    expect(t('Продажи')).toBe('Продажи');
  } finally {
    vi.unstubAllGlobals();
  }
});
test('display conversion never changes AMD input and falls back to AMD without rates', () => {
  const amount = 3600;
  const rates = {
    date: '2026-09-11',
    fetchedAt: '2026-09-11T00:00:00Z',
    amdPerUnit: { AMD: 1, USD: 360, EUR: 400, RUB: 4 },
  };
  configureMoney('USD', 'en', rates);
  expect(formatMoney(amount)).toBe('10 $');
  expect(amount).toBe(3600);
  configureMoney('EUR', 'en', rates);
  expect(formatMoney(amount)).toBe('9 €');
  configureMoney('RUB', 'en', rates);
  expect(formatMoney(amount)).toBe('900 ₽');
  configureMoney('USD', 'ru', null);
  expect(displayCurrency()).toBe('AMD');
  expect(formatMoney(amount)).toContain('֏');
});

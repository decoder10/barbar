export type Language = 'ru' | 'hy' | 'en';
export type Theme = 'light' | 'dark';
export type Currency = 'AMD' | 'RUB' | 'USD' | 'EUR';
export interface Preferences {
  language: Language;
  currency: Currency;
  theme?: Theme;
}
export const defaultPreferences: Preferences = { language: 'ru', currency: 'AMD' };
export interface ExchangeRates {
  date: string;
  fetchedAt: string;
  amdPerUnit: Record<Currency, number>;
}

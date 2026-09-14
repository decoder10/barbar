import { createContext } from 'react';
import type { Language, Currency, Theme, ExchangeRates } from '../domain/identity/preferences';
export const SettingsContext = createContext<{
  language: Language;
  currency: Currency;
  theme: Theme;
  pending: boolean;
  rates: ExchangeRates | null;
  rateError: boolean;
  update: (language: Language, currency: Currency, theme?: Theme) => Promise<void>;
} | null>(null);

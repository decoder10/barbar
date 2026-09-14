import type { Currency, ExchangeRates, Language } from './preferences';
let currency: Currency = 'AMD';
let formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
let divisor = 1;
const symbols = { AMD: '֏', RUB: '₽', USD: '$', EUR: '€' };
export function configureMoney(selected: Currency, language: Language, rates: ExchangeRates | null) {
  currency = selected === 'AMD' || rates?.amdPerUnit[selected] ? selected : 'AMD';
  divisor = currency === 'AMD' ? 1 : rates!.amdPerUnit[currency];
  formatter = new Intl.NumberFormat(language === 'hy' ? 'hy-AM' : language === 'en' ? 'en-US' : 'ru-RU', {
    maximumFractionDigits: 2,
  });
}
export const displayCurrency = () => currency;
export const formatMoney = (amount: number) => `${formatter.format(amount / divisor)} ${symbols[currency]}`;

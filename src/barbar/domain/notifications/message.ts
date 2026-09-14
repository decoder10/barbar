import type { StockAlert } from './stock-alerts';
export function alertMessage(alert: StockAlert, language = 'ru') {
  const locale = language === 'en' ? 'en-US' : language === 'hy' ? 'hy-AM' : 'ru-RU';
  const empty = language === 'en' ? 'Out of stock' : language === 'hy' ? 'Սպառվել է' : 'Закончилось';
  const low = language === 'en' ? 'Running low' : language === 'hy' ? 'Քիչ է մնացել' : 'Заканчивается';
  const unit =
    alert.unit === 'bottle'
      ? language === 'en'
        ? 'btl.'
        : language === 'hy'
          ? 'շիշ'
          : 'бут.'
      : alert.unit === 'g'
        ? language === 'en'
          ? 'g'
          : language === 'hy'
            ? 'գ'
            : 'г'
        : language === 'en'
          ? 'ml'
          : language === 'hy'
            ? 'մլ'
            : 'мл';
  return `${alert.severity === 'empty' ? empty : low}: ${alert.name} · ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Math.max(0, alert.quantity))} ${unit}`;
}

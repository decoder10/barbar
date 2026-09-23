import type { StockAlert } from './stock-alerts';

export interface PurchaseNotice {
  purchaseId: string;
  name: string;
  quantity: number;
  unit: string;
  /** Purchase total in AMD, as saved. */
  amount: number;
  date: string;
  createdAt: string;
}

const localeFor = (language: string) => (language === 'en' ? 'en-US' : language === 'hy' ? 'hy-AM' : 'ru-RU');
const labels: Record<string, [string, string, string]> = {
  bottle: ['бут.', 'btl.', 'շիշ'],
  pcs: ['шт.', 'pcs', 'հատ'],
  g: ['г', 'g', 'գ'],
  ml: ['мл', 'ml', 'մլ'],
};
export function unitText(unit: string, language = 'ru') {
  const [ru, en, hy] = labels[unit] || labels.ml;
  return language === 'en' ? en : language === 'hy' ? hy : ru;
}
const amount = (value: number, language: string) =>
  new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 2 }).format(value);

export function alertMessage(alert: StockAlert, language = 'ru') {
  const empty = language === 'en' ? 'Out of stock' : language === 'hy' ? 'Սպառվել է' : 'Закончилось';
  const low = language === 'en' ? 'Running low' : language === 'hy' ? 'Քիչ է մնացել' : 'Заканчивается';
  return `${alert.severity === 'empty' ? empty : low}: ${alert.name} · ${amount(Math.max(0, alert.quantity), language)} ${unitText(alert.unit, language)}`;
}

export const purchaseTitle = (language = 'ru') =>
  'Barbar · ' + (language === 'en' ? 'Purchase' : language === 'hy' ? 'Գնում' : 'Закупка');

/** Owner-only text: item, quantity, saved total and the server time in Yerevan. */
export function purchaseMessage(notice: PurchaseNotice, language = 'ru') {
  const created = new Date(notice.createdAt);
  const time = new Intl.DateTimeFormat(localeFor(language), {
    timeZone: 'Asia/Yerevan',
    hour: '2-digit',
    minute: '2-digit',
  }).format(created);
  const createdDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yerevan' }).format(created);
  const dated =
    notice.date !== createdDay
      ? ` · ${language === 'en' ? 'purchase date' : language === 'hy' ? 'գնման ամսաթիվ' : 'дата закупки'} ${notice.date}`
      : '';
  return `${notice.name} · ${amount(notice.quantity, language)} ${unitText(notice.unit, language)} · ${amount(notice.amount, language)} ֏ · ${time}${dated}`;
}

/** A guest request as notifications carry it: the table, what was asked for and its menu total. */
export interface GuestNotice {
  tableName: string;
  lines?: { name: string; quantity: number; servingMl?: number }[];
  /** Menu total in AMD at the time of the request. */
  total?: number;
  comment?: string;
}
const tableWord = (language: string) => (language === 'en' ? 'Table' : language === 'hy' ? 'Սեղան' : 'Стол');
export const guestRequestLabel = (language = 'ru') =>
  language === 'en' ? 'Guest request' : language === 'hy' ? 'Հյուրի հայտ' : 'Заявка гостя';
/** «Стол 3 · Заявка гостя»: the table comes first, it is what staff look for. */
export const guestTitle = (tableName: string, language = 'ru') =>
  `${tableWord(language)} ${tableName} · ${guestRequestLabel(language)}`;
export const guestLineText = (line: NonNullable<GuestNotice['lines']>[number], language = 'ru') =>
  `${line.name} × ${line.quantity}${line.servingMl ? ` · ${line.servingMl} ${unitText('ml', language)}` : ''}`;
/** Push body: every line and the total; an event written before lines were stored names its table. */
export function guestMessage(notice: GuestNotice, language = 'ru') {
  if (!notice.lines?.length) return `${tableWord(language)} ${notice.tableName}`;
  const total = notice.total ? ` · ${amount(notice.total, language)} ֏` : '';
  return notice.lines.map((line) => guestLineText(line, language)).join(', ') + total;
}

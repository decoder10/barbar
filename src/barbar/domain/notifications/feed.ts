import { alertMessage, purchaseMessage, type PurchaseNotice } from './message';
import type { StockAlert } from './stock-alerts';

/** One delivered notification, as the server queued it. */
export type FeedItem = {
  id: string;
  createdAt: string;
  /** True once the push queue finished with the event. */
  delivered: boolean;
} & ({ kind: 'stock'; alerts: StockAlert[] } | { kind: 'purchase'; purchase: PurchaseNotice });

export const feedTitle = (item: FeedItem) =>
  item.kind === 'purchase'
    ? 'Закупка'
    : item.alerts.some((alert) => alert.severity === 'empty')
      ? 'Закончилось на складе'
      : 'Заканчивается на складе';

/** Every line of the notification, in the interface language, exactly as it was sent. */
export const feedLines = (item: FeedItem, language = 'ru') =>
  item.kind === 'purchase'
    ? [purchaseMessage(item.purchase, language)]
    : item.alerts.map((alert) => alertMessage(alert, language));

/** The collapsed line for the list: the first message, plus how many more the notification carried. */
export function feedSummary(item: FeedItem, language = 'ru') {
  const lines = feedLines(item, language);
  return lines.length > 1 ? `${lines[0]} · +${lines.length - 1}` : lines[0] || '';
}

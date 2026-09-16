import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBar } from '../../app/providers/BarProvider';
import { alertMessage } from '../../domain/notifications/message';
import { locale, t } from '../../presentation/i18n/runtime';
import { useStockAlerts } from './use-stock-alerts';

/** The floating stack of live stock warnings; each can be dismissed, the link opens the warehouse. */
export function StockAlerts() {
  const { busy } = useBar();
  const { alerts, dismiss } = useStockAlerts();
  if (!alerts.length) return null;
  return (
    <section className="stock-alerts" aria-label={t('Уведомления об остатках')}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {alerts.map((alert) => (
          <div className={`stock-alert ${alert.severity}`} key={alert.id}>
            <p>{alertMessage(alert, locale().slice(0, 2))}</p>
            <button
              className="icon-button"
              disabled={busy}
              aria-label={`${t('Скрыть уведомление')}: ${alert.name}`}
              onClick={() => dismiss(alert.id)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <Link
        to="/inventory"
        onClick={(e) => {
          if (busy) e.preventDefault();
        }}
        aria-disabled={busy}
      >
        {t('Открыть склад')}
      </Link>
    </section>
  );
}

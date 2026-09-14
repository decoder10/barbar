import { Bell, BellRing, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBar } from '../../app/providers/BarProvider';
import {
  staffLevels,
  stockLevels,
  stockTransitions,
  type StockAlert,
  type StockLevel,
} from '../../domain/notifications/stock-alerts';
import { alertMessage } from '../../domain/notifications/message';
import { locale, t } from '../../presentation/i18n/runtime';
import { Modal } from '../../ui/modal';
import { BusyButton, LoadingStatus } from '../../ui/loading';
import { api } from '../../services/api-client';
import { pushSupported, usePushDevice } from './use-push-device';

export function StockNotifications() {
  const { data, staffData, role, hasData, busy } = useBar();
  const snapshot = useMemo(
    () =>
      !hasData ? null : role === 'admin' ? stockLevels(data) : staffData ? staffLevels(staffData) : null,
    [data, staffData, role, hasData],
  );
  const previous = useRef<StockLevel[] | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<{ publicKey: string | null } | null>(null);
  const [configError, setConfigError] = useState('');
  const device = usePushDevice();
  useEffect(() => {
    if (!snapshot) return;
    const changes = previous.current ? stockTransitions(previous.current, snapshot) : [];
    previous.current = snapshot;
    setAlerts((old) => {
      const retained = old.filter(
        (a) =>
          !changes.some((c) => c.id === a.id) &&
          snapshot.some((s) => s.id === a.id && s.quantity <= a.quantity),
      );
      return changes.length || retained.length !== old.length ? [...retained, ...changes].slice(-8) : old;
    });
  }, [snapshot]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void api('/api/barbar/push')
      .then((result) => {
        if (active) setConfig(result);
      })
      .catch(() => {
        if (active) setConfigError('Не удалось загрузить настройки уведомлений.');
      });
    return () => {
      active = false;
    };
  }, [open]);
  return (
    <>
      <button
        className="button secondary stock-notifications-toggle"
        disabled={busy}
        onClick={() => setOpen(true)}
        aria-label={t('Уведомления об остатках')}
      >
        {alerts.length ? <BellRing size={18} /> : <Bell size={18} />}
        <span>
          {t('Уведомления')}
          {alerts.length ? ` · ${alerts.length}` : ''}
        </span>
      </button>
      {!!alerts.length && (
        <section className="stock-alerts" aria-label={t('Уведомления об остатках')}>
          <div role="status" aria-live="polite" aria-atomic="true">
            {alerts.map((alert) => (
              <div className={`stock-alert ${alert.severity}`} key={alert.id}>
                <p>{alertMessage(alert, locale().slice(0, 2))}</p>
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`${t('Скрыть уведомление')}: ${alert.name}`}
                  onClick={() => setAlerts((old) => old.filter((a) => a.id !== alert.id))}
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
      )}
      {open && (
        <Modal
          title={t('Уведомления об остатках')}
          close={() => {
            if (!device.busy) setOpen(false);
          }}
        >
          <p>
            {t(
              'В приложении предупреждения включены автоматически. Порог: 3 бутылки или запас на 3 порции по рецептам.',
            )}
          </p>
          <p>
            {t(
              'Системные уведомления приходят, когда приложение в фоне или закрыто. Они действуют до выхода или окончания сеанса.',
            )}
          </p>
          {!pushSupported() ? (
            <p>
              {t(
                'Этот браузер не поддерживает push. На iPhone добавьте сайт на экран «Домой» и откройте его оттуда.',
              )}
            </p>
          ) : (
            <>
              {!config && !configError && <LoadingStatus />}
              {config && !config.publicKey && (
                <p>{t('Системные уведомления ещё не настроены на сервере.')}</p>
              )}
              <BusyButton
                className="button primary"
                busy={device.busy}
                disabled={!device.enabled && !config?.publicKey}
                onClick={() => void device.toggle(config?.publicKey || null)}
              >
                {t(device.enabled ? 'Выключить push на этом устройстве' : 'Включить push на этом устройстве')}
              </BusyButton>
            </>
          )}
          {(configError || device.error) && <p role="alert">{t(device.error || configError)}</p>}
        </Modal>
      )}
    </>
  );
}

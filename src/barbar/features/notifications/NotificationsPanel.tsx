import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { feedLines, feedSummary, feedTitle, type FeedItem } from '../../domain/notifications/feed';
import { businessTimeLabel } from '../../presentation/format-date';
import { locale, t } from '../../presentation/i18n/runtime';
import { Drawer } from '../../ui/drawer';
import { BusyButton, LoadingStatus } from '../../ui/loading';
import type { useNotificationsFeed } from './use-notifications-feed';
import { loadPushConfig, pushSupported, type PushDevice } from './use-push-device';

/** Push settings for this device and the recent notifications, newest first; a row opens its full text. */
export function NotificationsPanel({
  feed,
  device,
  close,
}: {
  feed: ReturnType<typeof useNotificationsFeed>;
  device: PushDevice;
  close: () => void;
}) {
  const [config, setConfig] = useState<{ publicKey: string | null } | null>(null);
  const [configError, setConfigError] = useState('');
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const language = locale().slice(0, 2);
  useEffect(() => {
    let active = true;
    void loadPushConfig()
      .then((result) => {
        if (active) setConfig(result);
      })
      .catch(() => {
        if (active) setConfigError('Не удалось загрузить настройки уведомлений.');
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Drawer
      title="Уведомления"
      close={() => {
        if (!device.busy) close();
      }}
    >
      {selected ? (
        <article className="notification-detail">
          <button type="button" className="button secondary" onClick={() => setSelected(null)}>
            <ChevronLeft size={16} />
            {t('К списку')}
          </button>
          <h3>{t(feedTitle(selected))}</h3>
          <time dateTime={selected.createdAt}>{businessTimeLabel(selected.createdAt)}</time>
          <ul>
            {feedLines(selected, language).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="muted">
            {t(selected.delivered ? 'Доставлено на устройства.' : 'Ещё в очереди на доставку.')}
          </p>
        </article>
      ) : (
        <>
          <section className="notification-settings" aria-label={t('Настройки push')}>
            <h3>{t('Push на этом устройстве')}</h3>
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
                  {t(
                    device.enabled ? 'Выключить push на этом устройстве' : 'Включить push на этом устройстве',
                  )}
                </BusyButton>
              </>
            )}
            {(configError || device.error) && <p role="alert">{t(device.error || configError)}</p>}
          </section>
          <section className="notification-feed" aria-label={t('Пришедшие уведомления')}>
            <h3>{t('Пришедшие')}</h3>
            {feed.loading && <LoadingStatus />}
            {feed.error && <p role="alert">{t(feed.error)}</p>}
            {!feed.loading && !feed.error && !feed.items.length && (
              <p className="muted">{t('Пока нет уведомлений.')}</p>
            )}
            <ul className="notification-list">
              {feed.items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setSelected(item)}>
                    <strong>{t(feedTitle(item))}</strong>
                    <span>{feedSummary(item, language)}</span>
                    <time dateTime={item.createdAt}>{businessTimeLabel(item.createdAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Drawer>
  );
}

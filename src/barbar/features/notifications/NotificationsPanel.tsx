import { Bell, BellOff, BellRing, CheckCheck, PackageMinus, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { feedLines, feedSummary, feedTitle, type FeedItem } from '../../domain/notifications/feed';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { businessTimeLabel } from '../../presentation/format-date';
import { locale, t } from '../../presentation/i18n/runtime';
import { Drawer } from '../../ui/drawer';
import { LoadingStatus } from '../../ui/loading';
import type { useNotificationReads } from './use-notification-reads';
import type { useNotificationsFeed } from './use-notifications-feed';
import { loadPushConfig, pushSupported, type PushDevice } from './use-push-device';

function KindIcon({ item }: { item: FeedItem }) {
  const Icon = item.kind === 'guest' ? BellRing : item.kind === 'purchase' ? ShoppingCart : PackageMinus;
  return (
    <span className={`notification-icon ${item.kind}`} aria-hidden="true">
      <Icon size={17} />
    </span>
  );
}
/** A guest request is about its table; other notifications are named by their kind. */
const heading = (item: FeedItem) =>
  item.kind === 'guest' ? `${t('Стол')} ${item.tableName}` : t(feedTitle(item));
/** «Заявка гостя · 3 позиций · 4 500 ֏» under the table name; lines are counted as on the board. */
const guestMeta = (item: Extract<FeedItem, { kind: 'guest' }>) =>
  [
    t(feedTitle(item)),
    item.lines?.length ? t(`${item.lines.length} позиций`) : undefined,
    item.total !== undefined ? money(item.total) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * The received notifications, unread first, with a push toggle in the header. A row opens its full
 * text; read and cleared marks stay on this device.
 */
export function NotificationsPanel({
  feed,
  reads,
  device,
  close,
}: {
  feed: ReturnType<typeof useNotificationsFeed>;
  reads: ReturnType<typeof useNotificationReads>;
  device: PushDevice;
  close: () => void;
}) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<{ publicKey: string | null } | null>(null);
  const [configError, setConfigError] = useState('');
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const language = locale().slice(0, 2);
  const supported = pushSupported();
  const pushLabel = t(
    device.enabled ? 'Выключить push на этом устройстве' : 'Включить push на этом устройстве',
  );
  const pushError = device.error || configError;
  const pushHint =
    pushError ||
    (!supported
      ? 'Этот браузер не поддерживает push. На iPhone добавьте сайт на экран «Домой» и откройте его оттуда.'
      : config && !config.publicKey
        ? 'Системные уведомления ещё не настроены на сервере.'
        : '');
  const selectedLines = selected ? feedLines(selected, language) : [];
  useEffect(() => {
    if (!supported) return;
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
  }, [supported]);
  const open = (item: FeedItem) => {
    reads.markRead(item);
    setSelected(item);
  };
  const unread = reads.unread;
  const read = reads.visible.filter(reads.isRead);
  const list = (items: FeedItem[]) => (
    <ul className="notification-list">
      {items.map((item) => {
        const fresh = !reads.isRead(item);
        return (
          <li key={item.id} className={`notification-item ${item.kind}${fresh ? ' unread' : ''}`}>
            <button type="button" onClick={() => open(item)}>
              <KindIcon item={item} />
              <span className="notification-text">
                <span className="notification-head">
                  <strong>{heading(item)}</strong>
                  <time dateTime={item.createdAt}>{businessTimeLabel(item.createdAt)}</time>
                </span>
                {item.kind === 'guest' && <span className="notification-meta">{guestMeta(item)}</span>}
                {feedSummary(item, language) && (
                  <span className="notification-summary">{feedSummary(item, language)}</span>
                )}
                {item.kind === 'guest' && item.comment && (
                  <span className="notification-summary">
                    {t('Комментарий гостя')}: {item.comment}
                  </span>
                )}
              </span>
              {fresh && <span className="notification-dot" role="img" aria-label={t('Не прочитано')} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <Drawer
      title="Уведомления"
      close={() => {
        if (!device.busy) close();
      }}
      back={selected ? () => setSelected(null) : undefined}
      actions={
        supported && (
          <button
            type="button"
            className="icon-button notification-push-toggle"
            aria-label={pushLabel}
            title={pushLabel}
            aria-pressed={device.enabled}
            aria-busy={device.busy}
            disabled={device.busy || (!device.enabled && !config?.publicKey)}
            onClick={() => void device.toggle(config?.publicKey || null)}
          >
            {device.busy ? (
              <span className="spinner" aria-hidden="true" />
            ) : device.enabled ? (
              <Bell size={20} aria-hidden="true" />
            ) : (
              <BellOff size={20} aria-hidden="true" />
            )}
          </button>
        )
      }
    >
      {selected ? (
        <article className={`notification-detail ${selected.kind}`}>
          <header>
            <KindIcon item={selected} />
            <div>
              <h3>{heading(selected)}</h3>
              <p>
                {selected.kind === 'guest' ? guestMeta(selected) : t(feedTitle(selected))} ·{' '}
                <time dateTime={selected.createdAt}>{businessTimeLabel(selected.createdAt)}</time>
              </p>
            </div>
          </header>
          {selectedLines.length > 0 && (
            <ul className="notification-lines">
              {selectedLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
          {selected.kind === 'guest' && selected.total !== undefined && (
            <p className="notification-total">
              <span>{t('Итого')}</span>
              <strong>{money(selected.total)}</strong>
            </p>
          )}
          {selected.kind === 'guest' && selected.comment && (
            <blockquote className="notification-comment">
              <small>{t('Комментарий гостя')}</small>
              {selected.comment}
            </blockquote>
          )}
          {selected.kind === 'guest' && (
            <button
              type="button"
              className="button primary full"
              onClick={() => {
                close();
                navigate('/');
              }}
            >
              {t('Открыть столы')}
            </button>
          )}
          <p className="muted">
            {t(selected.delivered ? 'Доставлено на устройства.' : 'Ещё в очереди на доставку.')}
          </p>
          {pushHint && (
            <p className="muted" role={pushError ? 'alert' : undefined}>
              {t(pushHint)}
            </p>
          )}
        </article>
      ) : (
        <>
          <section className="notification-feed" aria-label={t('Пришедшие уведомления')}>
            <div className="notification-tools">
              <button
                type="button"
                className="button secondary small"
                disabled={!unread.length}
                onClick={reads.markAllRead}
              >
                <CheckCheck size={15} /> {t('Прочитать все')}
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={!reads.visible.length}
                onClick={reads.clear}
              >
                <Trash2 size={15} /> {t('Очистить')}
              </button>
            </div>
            {pushHint && (
              <p className="muted" role={pushError ? 'alert' : undefined}>
                {t(pushHint)}
              </p>
            )}
            {feed.loading && !feed.items.length && <LoadingStatus />}
            {feed.error && <p role="alert">{t(feed.error)}</p>}
            {!feed.loading && !feed.error && !reads.visible.length && (
              <p className="notification-empty">{t('Пока нет уведомлений.')}</p>
            )}
            {unread.length > 0 && (
              <>
                <h3>
                  {t('Новые')} <span className="notification-count">{unread.length}</span>
                </h3>
                {list(unread)}
              </>
            )}
            {read.length > 0 && (
              <>
                <h3>{t('Прочитанные')}</h3>
                {list(read)}
              </>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

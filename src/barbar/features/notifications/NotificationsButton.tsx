import { Bell, BellRing } from 'lucide-react';
import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { t } from '../../presentation/i18n/runtime';
import { NotificationsPanel } from './NotificationsPanel';
import { useNotificationReads } from './use-notification-reads';
import { useNotificationsFeed } from './use-notifications-feed';
import { usePushDevice } from './use-push-device';

/** The bell in the header: the number of unread notifications, remembered on this device per user. */
export function NotificationsButton() {
  const { busy } = useBar();
  const feed = useNotificationsFeed();
  const reads = useNotificationReads(feed.items);
  // Registered once for the workspace lifetime, not on every panel opening.
  const device = usePushDevice();
  const [open, setOpen] = useState(false);
  const unread = reads.unread.length;
  return (
    <>
      <button
        type="button"
        className="icon-button notifications-bell"
        disabled={busy}
        aria-label={t(unread ? `Уведомления · непрочитанных: ${unread}` : 'Уведомления')}
        aria-haspopup="dialog"
        title={t('Уведомления')}
        onClick={() => {
          feed.reload();
          setOpen(true);
        }}
      >
        {unread ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && <span className="notifications-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <NotificationsPanel feed={feed} reads={reads} device={device} close={() => setOpen(false)} />}
    </>
  );
}

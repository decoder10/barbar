import { Bell, BellRing } from 'lucide-react';
import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { t } from '../../presentation/i18n/runtime';
import { useSessionFilter } from '../../presentation/use-session-filter';
import { NotificationsPanel } from './NotificationsPanel';
import { useNotificationsFeed } from './use-notifications-feed';
import { usePushDevice } from './use-push-device';

/** The bell in the header: the number of notifications received since the panel was last opened. */
export function NotificationsButton() {
  const { busy } = useBar();
  const feed = useNotificationsFeed();
  // Registered once for the workspace lifetime, not on every panel opening.
  const device = usePushDevice();
  const [open, setOpen] = useState(false);
  // Remembered per user for the tab session, so the badge only counts what is new to this person.
  const [seen, setSeen] = useSessionFilter<string>('notifications-seen', '', undefined, 'workspace');
  const unread = feed.items.filter((item) => item.createdAt > seen).length;
  return (
    <>
      <button
        type="button"
        className="icon-button notifications-bell"
        disabled={busy}
        aria-label={t('Уведомления об остатках')}
        aria-haspopup="dialog"
        title={t('Уведомления')}
        onClick={() => {
          setSeen(new Date().toISOString());
          feed.reload();
          setOpen(true);
        }}
      >
        {unread ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && <span className="notifications-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <NotificationsPanel feed={feed} device={device} close={() => setOpen(false)} />}
    </>
  );
}

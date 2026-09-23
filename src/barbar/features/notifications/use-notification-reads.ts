import { useCallback, useMemo, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import type { FeedItem } from '../../domain/notifications/feed';

/** Everything up to `readBefore` is read, later items only when opened; `clearedBefore` hides the rest. */
interface Reads {
  readBefore: string;
  read: string[];
  clearedBefore: string;
}
const empty: Reads = { readBefore: '', read: [], clearedBefore: '' };
function load(key: string): Reads {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value &&
      typeof value.readBefore === 'string' &&
      typeof value.clearedBefore === 'string' &&
      Array.isArray(value.read)
      ? { ...value, read: value.read.filter((id: unknown) => typeof id === 'string') }
      : empty;
  } catch {
    return empty;
  }
}
const newest = (items: FeedItem[]) => items.reduce((max, i) => (i.createdAt > max ? i.createdAt : max), '');

/**
 * Read and cleared marks of the shared feed, kept on this device for each user: clearing hides
 * notifications here only, the queue on the server is not touched.
 */
export function useNotificationReads(items: FeedItem[]) {
  const { user, role } = useBar();
  const key = `barbar-notification-reads:${user?.id || role || 'guest'}`;
  const [state, setState] = useState(() => ({ key, value: load(key) }));
  const reads = state.key === key ? state.value : load(key);
  const save = useCallback(
    (update: (current: Reads) => Reads) =>
      setState((previous) => {
        const value = update(previous.key === key ? previous.value : load(key));
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          /* Private mode: the marks last for this visit. */
        }
        return { key, value };
      }),
    [key],
  );
  const opened = useMemo(() => new Set(reads.read), [reads.read]);
  const visible = items.filter((item) => item.createdAt > reads.clearedBefore);
  const isRead = (item: FeedItem) => item.createdAt <= reads.readBefore || opened.has(item.id);
  const unread = visible.filter((item) => !isRead(item));
  return {
    visible,
    unread,
    isRead,
    markRead: (item: FeedItem) => {
      if (!isRead(item)) save((current) => ({ ...current, read: [item.id, ...current.read].slice(0, 200) }));
    },
    markAllRead: () => {
      const last = newest(items);
      if (last) save((current) => ({ ...current, readBefore: last, read: [] }));
    },
    clear: () => {
      const last = newest(items);
      if (last) save(() => ({ readBefore: last, read: [], clearedBefore: last }));
    },
  };
}

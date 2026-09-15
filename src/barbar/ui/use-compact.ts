import { useSyncExternalStore } from 'react';

/** Phone layout breakpoint shared with the `below(760px)` SCSS rules. */
const query = '(max-width: 760px)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** True on phones, where secondary tools move into bottom sheets. */
export function useCompact() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

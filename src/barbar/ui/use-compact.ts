import { useSyncExternalStore } from 'react';

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on phones, where secondary tools move into bottom sheets. Matches `below(760px)` SCSS rules. */
export function useCompact() {
  return useMediaQuery('(max-width: 760px)');
}

/** True on tablets, where the sidebar is an icon rail that opens over the content. */
export function useTablet() {
  return useMediaQuery('(min-width: 761px) and (max-width: 1024px)');
}

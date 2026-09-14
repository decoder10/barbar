import { useLayoutEffect } from 'react';

/** Section navigation always starts at the top, including browser back/forward. */
export function useRouteScroll(pathname: string) {
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
}

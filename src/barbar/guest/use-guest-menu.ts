import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestMenu } from '../domain/guest-menu';

const menuKey = 'barbar-guest-menu';
function savedMenu(): GuestMenu | null {
  try {
    const value = JSON.parse(localStorage.getItem(menuKey) || 'null') as GuestMenu | null;
    return value && Array.isArray(value.sections) ? value : null;
  } catch {
    return null;
  }
}

/** The public entry deliberately has no dependency on the authenticated workspace client. */
export function useGuestMenu() {
  const [menu, setMenu] = useState<GuestMenu | null>(savedMenu);
  const [error, setError] = useState(false);
  const current = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    try {
      const response = await fetch('/api/menu', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      });
      if (!response.ok) throw new Error('Menu unavailable');
      const value = (await response.json()) as GuestMenu;
      if (!Array.isArray(value.sections)) throw new Error('Invalid menu');
      if (controller.signal.aborted) return;
      setMenu(value);
      setError(false);
      try {
        localStorage.setItem(menuKey, JSON.stringify(value));
      } catch {
        // Blocked storage does not prevent browsing the current menu.
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      current.current?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [load]);
  return { menu, error, reload: load };
}

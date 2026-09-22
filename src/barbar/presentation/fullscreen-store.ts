import { useSyncExternalStore } from 'react';

/**
 * The focused («fullscreen») selling mode lives outside any page: switching between the tables board,
 * an order and the day's sales keeps it on until the person leaves it or the browser drops fullscreen.
 * `browser` means this app requested the Fullscreen API itself; `layout` is the focused layout alone.
 */
export type FullscreenMode = 'off' | 'layout' | 'browser';
let mode: FullscreenMode = 'off';
const listeners = new Set<() => void>();

export const fullscreenMode = () => mode;
export function setFullscreenMode(next: FullscreenMode) {
  if (mode === next) return;
  mode = next;
  listeners.forEach((listener) => listener());
}
/** True while the focused layout is on, whichever way it was entered. */
export function useFullscreen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => mode !== 'off',
    () => false,
  );
}

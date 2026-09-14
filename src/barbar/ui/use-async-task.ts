import { useCallback, useRef, useState } from 'react';

export type AsyncTaskRunner = <T>(task: () => Promise<T>, label?: string) => Promise<T | undefined>;

/** The ref closes the double-click gap before React has rendered disabled controls. */
export function useAsyncTask() {
  const active = useRef(false);
  const [label, setLabel] = useState<string | null>(null);
  const execute: AsyncTaskRunner = useCallback(async (task, message = 'Сохраняем…') => {
    if (active.current) return undefined;
    active.current = true;
    setLabel(message);
    try {
      return await task();
    } finally {
      active.current = false;
      setLabel(null);
    }
  }, []);
  return { execute, active, label, busy: label !== null };
}

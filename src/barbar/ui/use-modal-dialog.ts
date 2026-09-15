import { useEffect, useRef } from 'react';

/** Opens a native modal dialog on mount and locks page scroll until it unmounts. */
export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const root = document.documentElement;
    const oldOverflow = root.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      root.style.overflow = oldOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);
  return ref;
}

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { t } from '../presentation/i18n/runtime';

/** Reveal an already loaded catalog in batches; never fetch or rebuild the ledger. */
export function AutoReveal({
  total,
  visible,
  setVisible,
}: {
  total: number;
  visible: number;
  setVisible: Dispatch<SetStateAction<number>>;
}) {
  const target = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!target.current || visible >= total || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setVisible((count) => Math.min(total, count + 24));
      },
      { rootMargin: '0px 0px 400px 0px' },
    );
    observer.observe(target.current);
    return () => observer.disconnect();
  }, [total, visible, setVisible]);

  if (visible >= total) return null;
  return (
    <button
      ref={target}
      className="button secondary load-more"
      onClick={() => setVisible((count) => Math.min(total, count + 24))}
    >
      {t('Показать ещё · ')}
      {total - visible}
    </button>
  );
}

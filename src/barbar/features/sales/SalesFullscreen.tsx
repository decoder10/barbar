import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../presentation/i18n/runtime';
import { BusyButton } from '../../ui/loading';

export function SalesFullscreen({ children }: { children?: ReactNode }) {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const changing = useRef(false);
  const ownsFullscreen = useRef(false);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('sales-fullscreen', active);
    return () => document.documentElement.classList.remove('sales-fullscreen');
  }, [active]);

  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement && ownsFullscreen.current) {
        ownsFullscreen.current = false;
        setActive(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement && !document.querySelector('dialog[open]')) {
        setActive(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('keydown', onKey);
      if (ownsFullscreen.current && document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggle = async () => {
    if (changing.current) return;
    changing.current = true;
    setPending(true);
    try {
      if (active) {
        setActive(false);
        if (ownsFullscreen.current && document.fullscreenElement) await document.exitFullscreen();
        ownsFullscreen.current = false;
      } else {
        setActive(true);
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          ownsFullscreen.current = true;
          await document.documentElement.requestFullscreen();
        }
      }
    } catch {
      // Mobile/embedded browsers may deny fullscreen; the focused layout still works.
      ownsFullscreen.current = false;
    } finally {
      changing.current = false;
      setPending(false);
    }
  };

  return (
    <div className="sales-mode-toolbar">
      <BusyButton
        className="button secondary"
        aria-pressed={active}
        busy={pending}
        onClick={() => void toggle()}
      >
        {active ? <Minimize size={17} /> : <Maximize size={17} />}
        {t(active ? 'Выйти из полного экрана' : 'На весь экран')}
      </BusyButton>
      {children}
    </div>
  );
}

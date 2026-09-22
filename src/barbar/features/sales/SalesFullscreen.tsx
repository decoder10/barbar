import { Armchair, Maximize, Minimize, ShoppingBag } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fullscreenMode, setFullscreenMode, useFullscreen } from '../../presentation/fullscreen-store';
import { t } from '../../presentation/i18n/runtime';
import { BusyButton } from '../../ui/loading';

/**
 * Keeps the document in step with the focused mode: the `sales-fullscreen` class, the browser's
 * fullscreen and Escape. Mounted once in the workspace, so the mode survives route changes.
 */
export function FullscreenMode() {
  const active = useFullscreen();
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('sales-fullscreen', active);
    return () => document.documentElement.classList.remove('sales-fullscreen');
  }, [active]);
  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement && fullscreenMode() === 'browser') setFullscreenMode('off');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement && !document.querySelector('dialog[open]'))
        setFullscreenMode('off');
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('keydown', onKey);
      // Logging out unmounts the workspace: leave the browser's fullscreen with it.
      if (fullscreenMode() === 'browser' && document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
      setFullscreenMode('off');
    };
  }, []);
  return null;
}

/**
 * The focused-mode toolbar of a selling screen. With the sidebar hidden, it carries the one link the
 * screen lacks: the board and the order link to «Продажи», the day log links to «Столы».
 */
export function SalesFullscreen({ children, home = false }: { children?: ReactNode; home?: boolean }) {
  const active = useFullscreen();
  const [pending, setPending] = useState(false);
  const changing = useRef(false);

  const toggle = async () => {
    if (changing.current) return;
    changing.current = true;
    setPending(true);
    try {
      if (active) {
        const owned = fullscreenMode() === 'browser';
        setFullscreenMode('off');
        if (owned && document.fullscreenElement) await document.exitFullscreen();
      } else {
        setFullscreenMode('layout');
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          setFullscreenMode('browser');
          await document.documentElement.requestFullscreen();
        }
      }
    } catch {
      // Mobile/embedded browsers may deny fullscreen; the focused layout still works.
      setFullscreenMode('layout');
    } finally {
      changing.current = false;
      setPending(false);
    }
  };

  return (
    <div className="sales-mode-toolbar">
      {active && (
        <Link className="button secondary sales-fullscreen-tables" to={home ? '/sales' : '/'}>
          {home ? <ShoppingBag size={17} /> : <Armchair size={17} />}
          <span className="sales-fullscreen-label">{t(home ? 'Продажи' : 'Столы')}</span>
        </Link>
      )}
      <BusyButton
        className="button secondary"
        aria-pressed={active}
        busy={pending}
        onClick={() => void toggle()}
      >
        {active ? <Minimize size={17} /> : <Maximize size={17} />}
        <span className="sales-fullscreen-label">
          {t(active ? 'Выйти из полного экрана' : 'На весь экран')}
        </span>
      </BusyButton>
      {children}
    </div>
  );
}

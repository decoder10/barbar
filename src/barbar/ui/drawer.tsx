import { ChevronLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../presentation/i18n/runtime';
import { useModalDialog } from './use-modal-dialog';

/**
 * A panel anchored to the side of the window, for a list that is read next to the work,
 * not instead of it. On phones it fills the screen. The backdrop and Escape close it.
 */
export function Drawer({
  title,
  subtitle,
  close,
  back,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  /** A nested view returns to the list from the heading, next to the close button. */
  back?: () => void;
  /** Heading actions for the whole list, before the close button. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const ref = useModalDialog();
  return (
    <dialog
      ref={ref}
      className="modal drawer"
      aria-label={t(title)}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="drawer-body">
        <div className="modal-heading">
          <div>
            <h2>{t(title)}</h2>
            {subtitle && <p>{t(subtitle)}</p>}
          </div>
          <div className="drawer-heading-actions">
            {actions}
            {back && (
              <button
                type="button"
                className="icon-button"
                onClick={back}
                aria-label={t('К списку')}
                title={t('К списку')}
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <button type="button" className="icon-button" onClick={close} aria-label={t('Закрыть')}>
              <X size={20} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </dialog>
  );
}

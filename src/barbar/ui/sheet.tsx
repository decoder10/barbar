import { SlidersHorizontal, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { t } from '../presentation/i18n/runtime';
import { useModalDialog } from './use-modal-dialog';

/** Bottom sheet on phones (a centred dialog elsewhere) for secondary tools; the backdrop closes it. */
export function Sheet({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useModalDialog();
  return (
    <dialog
      ref={ref}
      className="modal sheet"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="sheet-body">
        <div className="modal-heading">
          <div>
            <h2>{t(title)}</h2>
            {subtitle && <p>{t(subtitle)}</p>}
          </div>
          <button type="button" className="icon-button" onClick={close} aria-label={t('Закрыть')}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export type SheetAction = {
  label: string;
  icon?: ReactNode;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
};

/** Large touch rows; the sheet closes before the chosen action opens its own dialog. */
export function SheetActions({ actions, close }: { actions: SheetAction[]; close: () => void }) {
  return (
    <div className="sheet-actions">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={action.disabled}
          onClick={() => {
            close();
            action.onClick();
          }}
        >
          {action.icon}
          <span>
            {t(action.label)}
            {action.hint && <small>{t(action.hint)}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A button that opens a sheet of actions, used to fold rare page actions on phones. */
export function MenuButton({
  label,
  title = label,
  icon,
  actions,
  className = 'button secondary',
  children,
}: {
  label: string;
  title?: string;
  icon: ReactNode;
  actions: SheetAction[];
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={children ? undefined : t(label)}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {icon}
        {children}
      </button>
      {open && (
        <Sheet title={title} close={() => setOpen(false)}>
          <SheetActions actions={actions} close={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

/** Sorting, view and secondary filters behind one icon; a dot marks a non-default choice. */
export function FilterSheet({ active, children }: { active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`filter-sheet-toggle ${active ? 'active' : ''}`}
        aria-label={t('Сортировка и фильтры')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={19} />
      </button>
      {open && (
        <Sheet title="Сортировка и фильтры" close={() => setOpen(false)}>
          <div className="filter-sheet">{children}</div>
          <button type="button" className="button primary full" onClick={() => setOpen(false)}>
            {t('Готово')}
          </button>
        </Sheet>
      )}
    </>
  );
}

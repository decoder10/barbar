import { Check, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';

export function Modal({
  title,
  subtitle,
  children,
  close,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { busy, notice } = useBar();
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
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          close();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">BARBAR CAFE</span>
          <h2>{t(title)}</h2>
          {t(subtitle && <p>{t(subtitle)}</p>)}
        </div>
        <button className="icon-button" disabled={busy} onClick={close} aria-label={t('Закрыть')}>
          <X size={20} />
        </button>
      </div>
      {t(
        notice?.error && (
          <div className="modal-error" role="alert">
            {t(notice.text)}
          </div>
        ),
      )}
      {t(children)}
    </dialog>
  );
}

export function Submit({
  children = 'Сохранить',
  disabled = false,
}: {
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { busy } = useBar();
  return (
    <button type="submit" className="button primary full" disabled={busy || disabled}>
      {t(busy ? <span className="spinner" /> : <Check size={18} />)} {t(busy ? 'Сохраняем…' : children)}
    </button>
  );
}

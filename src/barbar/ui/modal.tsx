import { BusyButton, LoadingStatus } from './loading';
import { Check, X } from 'lucide-react';
import { type ReactNode } from 'react';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useModalDialog } from './use-modal-dialog';

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
  const ref = useModalDialog();
  const { busy, activity, notice } = useBar();
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-busy={busy}
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
      {busy && <LoadingStatus label={activity || 'Сохраняем…'} className="modal-progress" />}
      <fieldset className="action-lock" disabled={busy}>
        {t(children)}
      </fieldset>
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
  const { busy, activity } = useBar();
  return (
    <BusyButton
      type="submit"
      className="button primary full"
      busy={busy}
      busyLabel={activity || 'Сохраняем…'}
      disabled={disabled}
    >
      <Check size={18} /> {t(children)}
    </BusyButton>
  );
}

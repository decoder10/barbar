import type { ButtonHTMLAttributes } from 'react';
import { t } from '../presentation/i18n/runtime';

export function LoadingStatus({
  label = 'Загружаем…',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={`loading-status ${className}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {t(label)}
    </span>
  );
}

export function BusyButton({
  busy = false,
  busyLabel = 'Сохраняем…',
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyLabel?: string }) {
  return (
    <button {...props} disabled={disabled || busy} aria-busy={busy}>
      {busy ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {t(busyLabel)}
        </>
      ) : (
        children
      )}
    </button>
  );
}

import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { CatalogImage } from '../catalog/media/CatalogImage';
import { photos } from '../catalog/media/photo-catalog';
import { Modal } from '../../ui/modal';
import { t } from '../../presentation/i18n/runtime';

export const guestMenuUrl = (origin = window.location.origin) => `${origin}/menu`;

/** Vector QR code: crisp when printed, no image request and no third-party service. */
export function QrCodeSvg({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row++)
      for (let column = 0; column < count; column++)
        if (code.isDark(row, column)) d += `M${column + 4} ${row + 4}h1v1h-1z`;
    return { path: d, size: count + 8 };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#1f1a1d" />
    </svg>
  );
}

export function GuestMenuQrModal({
  close,
  table,
}: {
  close: () => void;
  table?: { name: string; code: string };
}) {
  const url = table ? `${guestMenuUrl()}?table=${encodeURIComponent(table.code)}` : guestMenuUrl();
  const local = /^(localhost|127\.|\[::1\])/.test(window.location.hostname);
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      title={t('Гостевое меню и QR-код')}
      subtitle={
        table
          ? 'Заказ со стола без регистрации. Заявку подтверждает сотрудник.'
          : 'Публичная страница без входа: названия, фото, порции и цены продажи.'
      }
      close={close}
    >
      <div className="guest-qr-card">
        <CatalogImage photo={photos['brand-logo']} alt="BAR BAR · Art Gallery" eager />
        <QrCodeSvg value={url} label={t('QR-код гостевого меню')} />
        <strong>{table ? `${t('Стол')} ${table.name}` : 'Menu · Меню · Ճաշացանկ'}</strong>
        <small>{url.replace(/^https?:\/\//, '')}</small>
      </div>
      {local && (
        <p className="form-warning">
          {t(
            'Это локальный адрес. Для печати откройте это окно на рабочем сайте, чтобы QR вёл на постоянную ссылку.',
          )}
        </p>
      )}
      <p className="form-help">
        {t(
          'Ссылка постоянная: цены берутся из текущего меню, поэтому QR-код не нужно перепечатывать после изменения цен.',
        )}
      </p>
      <div className="guest-qr-actions">
        <a className="button secondary" href={url} target="_blank" rel="noreferrer">
          {t('Открыть меню')}
        </a>
        <button
          type="button"
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {t(copied ? 'Ссылка скопирована' : 'Копировать ссылку')}
        </button>
        <button type="button" className="button primary" onClick={() => window.print()}>
          {t('Печать карточки')}
        </button>
      </div>
    </Modal>
  );
}

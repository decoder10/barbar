import { ArrowLeft, Armchair, QrCode } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBar } from '../app/providers/BarProvider';
import type { BarTable } from '../domain/types';
import { useOrders } from '../features/orders/use-orders';
import { t } from '../presentation/i18n/runtime';
import { PageHeading } from '../ui/layout';
import { LoadingStatus } from '../ui/loading';

// The QR card brings the QR encoder and the whole photo catalog: it stays out of the board's first screen
// and is fetched when this page opens, so a tap on a table shows its code at once.
const loadQr = () => import('../features/guest/GuestMenuQr');
const GuestMenuQrModal = lazy(() => loadQr().then((m) => ({ default: m.GuestMenuQrModal })));

/** Guest-menu QR codes of the active tables, kept off the board where they got in the way of service. */
export default function TableQrCodes() {
  const { role } = useBar();
  const { tables, loading, error } = useOrders();
  const [qr, setQr] = useState<BarTable | null>(null);
  const active = tables.filter((table) => table.active);
  useEffect(() => {
    void loadQr().catch(() => undefined);
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="ЗАЛ"
        title="QR-коды столов"
        description="Гость сканирует код стола, открывает меню и отправляет заявку. Коды постоянные, их не нужно перепечатывать после изменения цен."
      >
        <Link className="button secondary" to="/">
          <ArrowLeft size={16} />
          {t('Столы')}
        </Link>
      </PageHeading>
      {error && <p role="alert">{t(error)}</p>}
      {loading && !error ? (
        <LoadingStatus label="Открываем столы…" />
      ) : !active.length ? (
        <div className="empty">
          <span className="empty-icon">
            <Armchair size={26} />
          </span>
          <h3>{t('Столов пока нет')}</h3>
          <p>
            {t(
              role === 'admin'
                ? 'Добавьте столы кнопкой «Настроить столы» на доске, и у каждого появится свой QR-код.'
                : 'Попросите владельца добавить столы, и у каждого появится свой QR-код.',
            )}
          </p>
        </div>
      ) : (
        <div className="table-qr-grid">
          {active.map((table) => (
            <button
              type="button"
              className="table-qr-tile"
              key={table.id}
              aria-label={`${t('QR-код')} · ${t('Стол')} ${table.name}`}
              onClick={() => setQr(table)}
            >
              <QrCode size={28} aria-hidden="true" />
              <span className="table-name">{t(table.name)}</span>
              <small>{t('Показать QR-код')}</small>
            </button>
          ))}
        </div>
      )}
      {qr && (
        <Suspense fallback={null}>
          <GuestMenuQrModal table={qr} close={() => setQr(null)} />
        </Suspense>
      )}
    </>
  );
}

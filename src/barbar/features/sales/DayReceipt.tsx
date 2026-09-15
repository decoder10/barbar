import { ReceiptText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { businessDayHint } from '../../domain/business-day';
import { t } from '../../presentation/i18n/runtime';
import { Sheet } from '../../ui/sheet';
import { useCompact } from '../../ui/use-compact';

/** Day receipt: a sticky side panel on wide screens, a bottom bar with a sheet on phones. */
export function DayReceipt({
  dayLabel,
  count,
  total,
  metrics,
  label,
  children,
}: {
  dayLabel: string;
  count: number;
  total: string;
  /** Day metrics; phones show them in the sheet instead of above the catalog. */
  metrics: ReactNode;
  label?: string;
  children: ReactNode;
}) {
  const compact = useCompact();
  const [open, setOpen] = useState(false);
  if (!compact)
    return (
      <aside className="day-receipt" aria-label={label && t(label)}>
        <div className="receipt-heading">
          <span className="receipt-icon">
            <ReceiptText size={20} />
          </span>
          <div>
            <h2>{t('Продажи за день')}</h2>
            <p>{t(dayLabel)}</p>
          </div>
          <span className="count-badge">{t(count)}</span>
        </div>
        {children}
      </aside>
    );
  return (
    <>
      <button type="button" className="day-receipt-bar" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="receipt-icon">
          <ReceiptText size={19} />
        </span>
        <span>
          {t('Продажи за день')}
          <small>{t(dayLabel)}</small>
        </span>
        <span className="count-badge">{t(count)}</span>
        <strong>{t(total)}</strong>
      </button>
      {open && (
        <Sheet title="Продажи за день" subtitle={dayLabel} close={() => setOpen(false)}>
          {metrics}
          <div className="day-receipt" aria-label={label && t(label)}>
            {children}
          </div>
          <p className="business-day-hint">{t(businessDayHint)}</p>
        </Sheet>
      )}
    </>
  );
}

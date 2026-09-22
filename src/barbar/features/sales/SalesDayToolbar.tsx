import { ShiftCloseButton } from '../orders/ShiftCloseSheet';
import type { ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { businessToday } from '../../domain/business-day';
import { t } from '../../presentation/i18n/runtime';
import { SalesFullscreen } from './SalesFullscreen';

export function SalesDayToolbar({
  date,
  onChange,
  action,
}: {
  date: string;
  onChange: (date: string) => void;
  action?: ReactNode;
}) {
  const today = businessToday();
  const changeDate = (offset: number) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    const next = value.toISOString().slice(0, 10);
    if (next <= today) onChange(next);
  };
  return (
    <SalesFullscreen>
      <ShiftCloseButton day={date} />
      {action && <div className="sales-create-action">{action}</div>}
      <div className="date-control">
        <button aria-label={t('Предыдущий день')} onClick={() => changeDate(-1)}>
          <ChevronLeft size={16} />
        </button>
        <CalendarDays size={17} />
        <input
          aria-label={t('Дата продаж')}
          type="date"
          value={date}
          max={today}
          required
          onChange={(e) => {
            if (e.target.value && e.target.value <= today) onChange(e.target.value);
          }}
        />
        <button aria-label={t('Следующий день')} disabled={date >= today} onClick={() => changeDate(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </SalesFullscreen>
  );
}

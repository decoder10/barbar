import { ShiftCloseButton } from '../orders/ShiftCloseSheet';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { businessToday } from '../../domain/business-day';
import { t } from '../../presentation/i18n/runtime';
import { DatePicker } from '../../ui/date-picker';
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
        <DatePicker
          label="Дата продаж"
          value={date}
          max={today}
          onChange={(value) => {
            if (value && value <= today) onChange(value);
          }}
        />
        <button aria-label={t('Следующий день')} disabled={date >= today} onClick={() => changeDate(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </SalesFullscreen>
  );
}

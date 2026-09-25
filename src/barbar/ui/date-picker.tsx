import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { businessToday } from '../domain/business-day';
import { locale, t } from '../presentation/i18n/runtime';
import { Sheet } from './sheet';
import { useCompact } from './use-compact';

/* Dates stay `YYYY-MM-DD` / `YYYY-MM` strings; calendar maths runs in UTC so no time zone shifts a day. */
const DAY = 86400000;
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, n: number) =>
  new Date(utc(date).getTime() + n * DAY).toISOString().slice(0, 10);
const addMonths = (month: string, n: number) => {
  const d = utc(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const clamp = (value: string, min?: string, max?: string) =>
  min && value < min ? min : max && value > max ? max : value;
const format = (date: string, options: Intl.DateTimeFormatOptions) =>
  utc(date).toLocaleDateString(locale(), { ...options, timeZone: 'UTC' });
const capital = (text: string) => text.charAt(0).toLocaleUpperCase(locale()) + text.slice(1);

/** Chrome ships without Armenian calendar names and answers in English; CLDR names are used instead. */
const armenian = {
  months: 'Հունվար Փետրվար Մարտ Ապրիլ Մայիս Հունիս Հուլիս Օգոստոս Սեպտեմբեր Հոկտեմբեր Նոյեմբեր Դեկտեմբեր',
  short: 'հնվ փտվ մրտ ապր մյս հնս հլս օգս սեպ հոկ նոյ դեկ',
  weekdays: 'Երկ Երք Չրք Հնգ Ուր Շբթ Կիր',
};
const ownArmenian = () =>
  locale() === 'hy-AM' && !new Intl.DateTimeFormat('hy-AM').resolvedOptions().locale.startsWith('hy');
const armenianName = (kind: 'months' | 'short', date: string) =>
  armenian[kind].split(' ')[Number(date.slice(5, 7)) - 1];

const monthTitle = (month: string) =>
  ownArmenian()
    ? `${armenianName('months', month)} ${month.slice(0, 4)}`
    : capital(format(`${month}-01`, { month: 'long', year: 'numeric' }));
const monthShort = (month: string) =>
  capital(ownArmenian() ? armenianName('short', month) : format(`${month}-01`, { month: 'short' }));
const dayTitle = (date: string) =>
  ownArmenian()
    ? `${Number(date.slice(8))} ${armenianName('short', date)} ${date.slice(0, 4)}`
    : format(date, { day: 'numeric', month: 'short', year: 'numeric' });
const dayName = (date: string) =>
  ownArmenian()
    ? `${Number(date.slice(8))} ${armenianName('months', date)} ${date.slice(0, 4)}`
    : format(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
/** Monday first; 2026-09-14 is a Monday. */
const weekdays = () =>
  ownArmenian()
    ? armenian.weekdays.split(' ')
    : Array.from({ length: 7 }, (_, i) => capital(format(addDays('2026-09-14', i), { weekday: 'short' })));

type PanelProps<T extends string> = { value: T; min?: T; max?: T; pick: (value: T) => void };

/**
 * Trigger plus a popover (a bottom sheet on phones); the panel content decides what is picked.
 * Inside a dialog the panel opens as its own sheet: the top layer is not clipped by the dialog's scroll.
 */
function Picker({
  id,
  label,
  value,
  text,
  describedBy,
  panel,
}: {
  id?: string;
  label: string;
  value: string;
  text: string;
  describedBy?: string;
  panel: (pick: () => void) => ReactNode;
}) {
  const compact = useCompact();
  const [open, setOpen] = useState(false);
  const [inDialog, setInDialog] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const sheet = compact || inDialog;
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  // The popover is fixed to the viewport so a scrolling toolbar cannot clip it: under the trigger,
  // above it when there is no room below, right-aligned when it would leave the window.
  useLayoutEffect(() => {
    if (!open || sheet) return;
    const position = () => {
      if (!trigger.current || !popover.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = popover.current;
      const below = rect.bottom + 6 + height <= window.innerHeight || rect.top - 6 - height < 0;
      setPlace({
        top: below ? rect.bottom + 6 : rect.top - 6 - height,
        left: rect.left + width > window.innerWidth - 8 ? Math.max(8, rect.right - width) : rect.left,
      });
    };
    position();
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [open, sheet]);
  // The popover closes on a click or focus outside it, and on Escape wherever the focus is.
  useEffect(() => {
    if (!open || sheet) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, sheet]);
  const content = panel(() => close());
  return (
    <div className="date-picker" ref={root}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="date-picker-trigger"
        aria-label={`${t(label)}: ${text}`}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-value={value}
        onClick={() => {
          setInDialog(!!root.current?.closest('dialog'));
          setOpen((o) => !o);
        }}
      >
        <CalendarDays size={17} aria-hidden />
        <span>{text}</span>
        <ChevronDown size={16} aria-hidden className="date-picker-chevron" />
      </button>
      {open &&
        (sheet ? (
          <Sheet title={label} close={() => close()}>
            <div className="date-picker-panel in-sheet">{content}</div>
          </Sheet>
        ) : (
          <div ref={popover} className="date-picker-panel" style={place} role="dialog" aria-label={t(label)}>
            {content}
          </div>
        ))}
    </div>
  );
}

function PanelHeader({
  title,
  previous,
  next,
}: {
  title: string;
  previous: { label: string; disabled?: boolean; onClick: () => void };
  next: { label: string; disabled?: boolean; onClick: () => void };
}) {
  return (
    <div className="date-picker-head">
      <button
        type="button"
        aria-label={t(previous.label)}
        title={t(previous.label)}
        disabled={previous.disabled}
        onClick={previous.onClick}
      >
        <ChevronLeft size={18} />
      </button>
      <strong aria-live="polite">{title}</strong>
      <button
        type="button"
        aria-label={t(next.label)}
        title={t(next.label)}
        disabled={next.disabled}
        onClick={next.onClick}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

/** Arrow keys move the roving focus; Enter and Space are the buttons' own click. */
function useGridFocus(step: Record<string, number>, move: (by: number) => void) {
  const grid = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const onKeyDown = (event: KeyboardEvent) => {
    const by = step[event.key];
    if (!by) return;
    event.preventDefault();
    keyboard.current = true;
    move(by);
  };
  const focusCell = () => grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  // On opening, one frame later so the phone sheet's `showModal()` does not take the focus back.
  useEffect(() => {
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus());
  }, []);
  // After each arrow key the tabbable cell takes focus at once; pointer use leaves focus alone.
  useEffect(() => {
    if (!keyboard.current) return;
    keyboard.current = false;
    focusCell();
  });
  return { grid, onKeyDown };
}

function MonthPanel({ value, min, max, pick }: PanelProps<string>) {
  const [focused, setFocused] = useState(value);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const move = (by: number) => {
    const next = clamp(addMonths(focused, by), min, max);
    setFocused(next);
    setYear(Number(next.slice(0, 4)));
  };
  const { grid, onKeyDown } = useGridFocus({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }, move);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const current = businessToday().slice(0, 7);
  const tabbable = months.includes(focused) ? focused : months.find((m) => !(max && m > max)) || months[0];
  return (
    <>
      <PanelHeader
        title={String(year)}
        previous={{
          label: 'Предыдущий год',
          disabled: !!min && `${year - 1}-12` < min,
          onClick: () => setYear(year - 1),
        }}
        next={{
          label: 'Следующий год',
          disabled: !!max && `${year + 1}-01` > max,
          onClick: () => setYear(year + 1),
        }}
      />
      <div className="date-picker-grid months" ref={grid} onKeyDown={onKeyDown}>
        {months.map((month) => (
          <button
            key={month}
            type="button"
            tabIndex={month === tabbable ? 0 : -1}
            className={month === value ? 'selected' : month === current ? 'today' : ''}
            aria-pressed={month === value}
            aria-current={month === current ? 'date' : undefined}
            aria-label={monthTitle(month)}
            disabled={(!!max && month > max) || (!!min && month < min)}
            onFocus={() => setFocused(month)}
            onClick={() => pick(month)}
          >
            {monthShort(month)}
          </button>
        ))}
      </div>
      <div className="date-picker-foot">
        <button
          type="button"
          className="button secondary"
          disabled={(!!max && current > max) || (!!min && current < min)}
          onClick={() => pick(current)}
        >
          {t('Этот месяц')}
        </button>
      </div>
    </>
  );
}

function DayPanel({ value, min, max, pick, clear }: PanelProps<string> & { clear?: () => void }) {
  // An empty value opens on the business day, within the limits, with nothing selected.
  const [focused, setFocused] = useState(() => value || clamp(businessToday(), min, max));
  const [view, setView] = useState(focused.slice(0, 7));
  const move = (by: number) => {
    const next = clamp(addDays(focused, by), min, max);
    setFocused(next);
    setView(next.slice(0, 7));
  };
  const { grid, onKeyDown } = useGridFocus({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }, move);
  const first = `${view}-01`;
  const start = addDays(first, -((utc(first).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = businessToday();
  const outOfRange = (day: string) => (!!min && day < min) || (!!max && day > max);
  const inView = days.filter((d) => d.startsWith(view) && !outOfRange(d));
  const tabbable = inView.includes(focused) ? focused : inView[0] || days[0];
  return (
    <>
      <PanelHeader
        title={monthTitle(view)}
        previous={{
          label: 'Предыдущий месяц',
          disabled: !!min && view <= min.slice(0, 7),
          onClick: () => setView(addMonths(view, -1)),
        }}
        next={{
          label: 'Следующий месяц',
          disabled: !!max && view >= max.slice(0, 7),
          onClick: () => setView(addMonths(view, 1)),
        }}
      />
      <div className="date-picker-weekdays" aria-hidden>
        {weekdays().map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="date-picker-grid days" ref={grid} onKeyDown={onKeyDown}>
        {days.map((day) => (
          <button
            key={day}
            type="button"
            tabIndex={day === tabbable ? 0 : -1}
            className={[
              day === value ? 'selected' : day === today ? 'today' : '',
              day.startsWith(view) ? '' : 'outside',
            ].join(' ')}
            aria-pressed={day === value}
            aria-current={day === today ? 'date' : undefined}
            aria-label={dayName(day)}
            disabled={outOfRange(day)}
            onFocus={() => setFocused(day)}
            onClick={() => pick(day)}
          >
            {Number(day.slice(8))}
          </button>
        ))}
      </div>
      <div className="date-picker-foot">
        {clear && value && (
          <button type="button" className="button secondary" onClick={clear}>
            {t('Очистить')}
          </button>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={outOfRange(today)}
          onClick={() => pick(today)}
        >
          {t('Сегодня')}
        </button>
      </div>
    </>
  );
}

type PickerProps<T extends string> = {
  label: string;
  value: T;
  min?: T;
  max?: T;
  onChange: (value: T) => void;
  id?: string;
  'aria-describedby'?: string;
};

/** A month (`YYYY-MM`) in the app's style, shown in words in the interface language. */
export function MonthPicker({ label, value, min, max, onChange, id, ...rest }: PickerProps<string>) {
  return (
    <Picker
      id={id}
      label={label}
      value={value}
      text={monthTitle(value)}
      describedBy={rest['aria-describedby']}
      panel={(close) => (
        <MonthPanel
          value={value}
          min={min}
          max={max}
          pick={(month) => {
            onChange(month);
            close();
          }}
        />
      )}
    />
  );
}

/**
 * A day (`YYYY-MM-DD`) in the app's style; days outside min/max cannot be chosen.
 * An optional date passes `placeholder` for the empty value and `clearable` to let it be emptied ('').
 */
export function DatePicker({
  label,
  value,
  min,
  max,
  onChange,
  id,
  placeholder = '',
  clearable = false,
  ...rest
}: PickerProps<string> & { placeholder?: string; clearable?: boolean }) {
  return (
    <Picker
      id={id}
      label={label}
      value={value}
      text={value ? dayTitle(value) : t(placeholder)}
      describedBy={rest['aria-describedby']}
      panel={(close) => (
        <DayPanel
          value={value}
          min={min}
          max={max}
          pick={(day) => {
            onChange(day);
            close();
          }}
          clear={
            clearable
              ? () => {
                  onChange('');
                  close();
                }
              : undefined
          }
        />
      )}
    />
  );
}

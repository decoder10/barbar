import { useSessionFilter } from '../../presentation/use-session-filter';
import { useEffect, useState } from 'react';
import { businessToday } from '../../domain/business-day';
/** The current shift day, re-checked every 10 s and on focus, so screens roll over at 06:00 without a reload. */
export function useBusinessToday() {
  const [current, setCurrent] = useState(businessToday);
  useEffect(() => {
    const update = () => setCurrent(businessToday());
    const timer = window.setInterval(update, 10000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  return current;
}
export function useBusinessDate() {
  const current = useBusinessToday();
  const [chosen, setChosen] = useSessionFilter<string | null>(
    'business-date',
    null,
    (value): value is string | null =>
      value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)),
  );
  const select = (date: string) => setChosen(date === businessToday() ? null : date);
  return [chosen || current, select] as const;
}

import { useEffect, useState } from 'react';
import { businessToday } from '../../domain/business-day';
export function useBusinessDate() {
  const [current, setCurrent] = useState(businessToday);
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setCurrent(businessToday());
    const timer = window.setInterval(update, 10000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  const select = (date: string) => setChosen(date === businessToday() ? null : date);
  return [chosen || current, select, chosen === null] as const;
}

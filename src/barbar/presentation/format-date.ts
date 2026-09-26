import { locale } from './i18n/runtime';

/** The chosen business day, written out in the interface language. */
export const businessDayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });

/** The business day without the weekday («24 сентября»), for short labels. */
export const businessDayShortLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

/** «12 мин» / «1 ч 05 мин» since an ISO instant; the caller supplies `now` so a list shares one clock. */
export const elapsedLabel = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  return minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
};

/** Day and time of a server event, shown in bar time (Yerevan) in the interface language. */
export const businessTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString(locale(), {
    timeZone: 'Asia/Yerevan',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

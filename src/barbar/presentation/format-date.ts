import { locale } from './i18n/runtime';

/** The chosen business day, written out in the interface language. */
export const businessDayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });

/** Day and time of a server event, shown in bar time (Yerevan) in the interface language. */
export const businessTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString(locale(), {
    timeZone: 'Asia/Yerevan',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

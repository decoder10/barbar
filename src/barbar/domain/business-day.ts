export const BUSINESS_TIME_ZONE = 'Asia/Yerevan';
export const BUSINESS_DAY_START_HOUR = 6;
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE });
/** A shift starting on the named date includes the following morning until 06:00 in Yerevan. */
export function businessToday(now = new Date()) {
  return dateFormatter.format(new Date(now.getTime() - BUSINESS_DAY_START_HOUR * 3600000));
}
export const businessDayHint = 'День смены: 06:00–05:59 · Ереван';

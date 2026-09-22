import type { Language } from '../../domain/identity/preferences';
let language: Language = 'ru';
let dictionary: Record<string, string> = {};
let fragments: RegExp | undefined;
const cache = new Map<string, string>();
export const locale = () => (language === 'hy' ? 'hy-AM' : language === 'en' ? 'en-US' : 'ru-RU');
/** The active interface language, for texts that come localized from configuration. */
export const currentLanguage = () => language;
export function setTranslations(next: Language, messages: Record<string, string> = {}) {
  language = next;
  dictionary = messages;
  cache.clear();
  const keys = Object.keys(messages)
    .filter((k) => k.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  fragments = keys.length ? new RegExp('(?<!\\p{L})(?:' + keys.join('|') + ')(?!\\p{L})', 'gu') : undefined;
  document.documentElement.lang = next;
}
/** Translate presentation text only. Never use for data, input values, or API payloads. */
export function t<T>(value: T): T {
  if (language === 'ru' || typeof value !== 'string') return value;
  const cached = cache.get(value);
  if (cached !== undefined) return cached as T;
  const trimmed = value.trim();
  let result = dictionary[trimmed];
  if (result !== undefined) result = value.replace(trimmed, result);
  else result = fragments ? value.replace(fragments, (key) => dictionary[key]) : value;
  if (cache.size > 4000) cache.clear();
  cache.set(value, result);
  return result as T;
}

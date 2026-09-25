import type { Language } from '../../domain/identity/preferences';
let language: Language = 'ru';
let dictionary: Record<string, string> = {};
let fragments: RegExp | undefined;
const cache = new Map<string, string>();
// The server switches languages per request (the guest menu render): compile each dictionary once.
const compiled = new WeakMap<Record<string, string>, RegExp | undefined>();
export const locale = () => (language === 'hy' ? 'hy-AM' : language === 'en' ? 'en-US' : 'ru-RU');
/** The active interface language, for texts that come localized from configuration. */
export const currentLanguage = () => language;
export function setTranslations(next: Language, messages: Record<string, string> = {}) {
  language = next;
  dictionary = messages;
  cache.clear();
  if (!compiled.has(messages)) {
    const keys = Object.keys(messages)
      .filter((k) => k.length > 0)
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    compiled.set(
      messages,
      keys.length ? new RegExp('(?<!\\p{L})(?:' + keys.join('|') + ')(?!\\p{L})', 'gu') : undefined,
    );
  }
  fragments = compiled.get(messages);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}
let used: Record<string, string> | undefined;
/**
 * Server rendering: run `render` and collect every translation it used as an exact entry, so the browser
 * can hydrate the same text with this small dictionary instead of waiting for the whole one.
 */
export function recordTranslations<T>(render: () => T) {
  used = {};
  try {
    const result = render();
    return { result, translations: used };
  } finally {
    used = undefined;
  }
}
function record(value: string, result: string) {
  // The exact entry reproduces the result through the dictionary branch of `t`.
  const lead = value.length - value.trimStart().length;
  const trail = value.length - value.trimEnd().length;
  if (result.startsWith(value.slice(0, lead)) && result.endsWith(value.slice(value.length - trail)))
    used![value.trim()] = result.slice(lead, result.length - trail);
}
/** Translate presentation text only. Never use for data, input values, or API payloads. */
export function t<T>(value: T): T {
  if (language === 'ru' || typeof value !== 'string') return value;
  let result = cache.get(value);
  if (result === undefined) {
    const trimmed = value.trim();
    result = dictionary[trimmed];
    if (result !== undefined) result = value.replace(trimmed, result);
    else result = fragments ? value.replace(fragments, (key) => dictionary[key]) : value;
    if (cache.size > 4000) cache.clear();
    cache.set(value, result);
  }
  if (used && result !== value) record(value, result);
  return result as T;
}

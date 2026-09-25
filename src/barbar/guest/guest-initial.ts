import type { GuestMenu } from '../domain/guest-menu';
import type { Language } from '../domain/identity/preferences';

export type GuestTheme = 'dark' | 'light';
export type GuestView = 'grid' | 'list';
/**
 * What the server rendered `/menu` with. The page embeds it, so the browser hydrates the same markup
 * and only then applies this device's saved choices and the fresh `/api/menu`.
 */
export interface GuestInitial {
  menu: GuestMenu;
  language: Language;
  theme: GuestTheme;
  view: GuestView;
  /** Only the translations the server render used; the full dictionary loads after hydration. */
  translations?: Record<string, string>;
}
/** `<script type="application/json">` holding the initial state; data only, never executed. */
export const guestDataId = 'guest-menu-data';
/** Language, theme and view for the server render, e.g. `en.dark.grid`. Sent only to `/menu`. */
export const guestCookie = 'barbar-guest';
export const guestLanguages: Language[] = ['en', 'ru', 'hy'];

export const guestTitle = (language: Language) =>
  `BAR BAR · ${language === 'ru' ? 'Меню' : language === 'hy' ? 'Ճաշացանկ' : 'Menu'}`;

export function readGuestCookie(header: string | null | undefined) {
  const value = (header || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${guestCookie}=`))
    ?.slice(guestCookie.length + 1);
  const [language, theme, view] = (value || '').split('.');
  return {
    language: guestLanguages.includes(language as Language) ? (language as Language) : undefined,
    theme: theme === 'light' || theme === 'dark' ? (theme as GuestTheme) : undefined,
    view: view === 'list' || view === 'grid' ? (view as GuestView) : undefined,
  };
}

export function writeGuestCookie(language: Language, theme: GuestTheme, view: GuestView) {
  try {
    document.cookie = `${guestCookie}=${language}.${theme}.${view}; Path=/menu; Max-Age=31536000; SameSite=Lax${
      location.protocol === 'https:' ? '; Secure' : ''
    }`;
  } catch {
    // Without cookies the next page is rendered with defaults and the saved choice applies after load.
  }
}

/** The guest's preferred menu language from `Accept-Language`: the first of EN, RU or HY, English otherwise. */
export function acceptedLanguage(header: string | null | undefined): Language {
  const ranked = (header || '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.split(';').map((value) => value.trim());
      const q = Number(params.find((p) => p.startsWith('q='))?.slice(2) ?? 1);
      return { language: tag.slice(0, 2).toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return (ranked.find((entry) => guestLanguages.includes(entry.language as Language))?.language ||
    'en') as Language;
}

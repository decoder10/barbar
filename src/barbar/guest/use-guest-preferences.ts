import { useEffect, useState } from 'react';
import type { Language } from '../domain/identity/preferences';
import type { GuestMenuItem } from '../domain/guest-menu';
import { setTranslations } from '../presentation/i18n/runtime';
import {
  guestTitle,
  writeGuestCookie,
  type GuestInitial,
  type GuestTheme,
  type GuestView,
} from './guest-initial';

function read(key: string) {
  try {
    return localStorage.getItem(`barbar-guest-${key}`);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(`barbar-guest-${key}`, value);
  } catch {
    // Preferences remain usable in memory when storage is restricted.
  }
}
function savedFavorites() {
  try {
    const value: unknown = JSON.parse(read('favorites') || '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
const savedLanguage = () => {
  const value = read('language');
  return value === 'en' || value === 'ru' || value === 'hy' ? value : undefined;
};

export const favoriteKey = (item: GuestMenuItem) => `${item.category}:${item.id}`;

/**
 * Language, theme, view and favourites of this device. A server-rendered page starts from what the server
 * rendered (`initial`), so hydration matches; the device's saved choices apply right after and only then
 * are saved back, together with the cookie the next server render reads.
 */
export function useGuestPreferences(initial?: Pick<GuestInitial, 'language' | 'theme' | 'view'>) {
  const [language, setLanguage] = useState<Language>(() => {
    if (initial) return initial.language;
    const value = savedLanguage() || navigator.language.slice(0, 2);
    return value === 'ru' || value === 'hy' ? value : 'en';
  });
  // A hydrated page starts with the server's few translations; the full dictionary replaces them with
  // a new object, so the menu renders once more and anything shown meanwhile is translated too.
  const [dictionary, setDictionary] = useState<{ language: Language } | null>(
    initial ? { language: initial.language } : null,
  );
  const [translationError, setTranslationError] = useState(false);
  const [translationAttempt, setTranslationAttempt] = useState(0);
  const [theme, setTheme] = useState<GuestTheme>(
    () => initial?.theme || (read('theme') === 'light' ? 'light' : 'dark'),
  );
  const [view, setView] = useState<GuestView>(
    () => initial?.view || (read('view') === 'list' ? 'list' : 'grid'),
  );
  const [favorites, setFavorites] = useState<string[]>(() => (initial ? [] : savedFavorites()));
  const [restored, setRestored] = useState(!initial);
  useEffect(() => {
    if (restored) return;
    const language = savedLanguage();
    const theme = read('theme');
    const view = read('view');
    if (language) setLanguage(language);
    if (theme === 'light' || theme === 'dark') setTheme(theme);
    if (view === 'list' || view === 'grid') setView(view);
    setFavorites(savedFavorites());
    setRestored(true);
  }, [restored]);
  useEffect(() => {
    let active = true;
    setTranslationError(false);
    const messages =
      language === 'ru'
        ? Promise.resolve({})
        : (language === 'hy'
            ? import('../presentation/i18n/hy.json')
            : import('../presentation/i18n/en.json')
          ).then((module) => module.default as Record<string, string>);
    void messages
      .then((value) => {
        if (active) {
          setTranslations(language, value);
          setDictionary({ language });
        }
      })
      .catch(() => {
        if (active) setTranslationError(true);
      });
    document.title = guestTitle(language);
    return () => {
      active = false;
    };
  }, [language, translationAttempt]);
  useEffect(() => {
    if (!restored) return;
    save('language', language);
    save('theme', theme);
    save('view', view);
    writeGuestCookie(language, theme, view);
  }, [restored, language, theme, view]);
  useEffect(() => {
    if (restored) save('favorites', JSON.stringify(favorites));
  }, [restored, favorites]);
  const toggleFavorite = (item: GuestMenuItem) => {
    const key = favoriteKey(item);
    setFavorites((ids) => (ids.includes(key) ? ids.filter((id) => id !== key) : [...ids, key]));
  };
  return {
    language,
    setLanguage,
    ready: dictionary?.language === language,
    translationError,
    retryTranslations: () => setTranslationAttempt((attempt) => attempt + 1),
    theme,
    setTheme,
    view,
    setView,
    favorites,
    toggleFavorite,
    clearFavorites: () => setFavorites([]),
  };
}

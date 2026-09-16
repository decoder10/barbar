import { useEffect, useState } from 'react';
import type { Language } from '../domain/identity/preferences';
import type { GuestMenuItem } from '../domain/guest-menu';
import { setTranslations } from '../presentation/i18n/runtime';

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

export const favoriteKey = (item: GuestMenuItem) => `${item.category}:${item.id}`;

export function useGuestPreferences() {
  const [language, setLanguage] = useState<Language>(() => {
    const value = read('language') || navigator.language.slice(0, 2);
    return value === 'ru' || value === 'hy' ? value : 'en';
  });
  const [dictionary, setDictionary] = useState<Language | null>(null);
  const [translationError, setTranslationError] = useState(false);
  const [translationAttempt, setTranslationAttempt] = useState(0);
  const [theme, setTheme] = useState(() => (read('theme') === 'light' ? 'light' : 'dark'));
  const [view, setView] = useState(() => (read('view') === 'list' ? 'list' : 'grid'));
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(read('favorites') || '[]');
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
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
          setDictionary(language);
        }
      })
      .catch(() => {
        if (active) setTranslationError(true);
      });
    save('language', language);
    document.title = `BAR BAR · ${language === 'ru' ? 'Меню' : language === 'hy' ? 'Ճաշացանկ' : 'Menu'}`;
    return () => {
      active = false;
    };
  }, [language, translationAttempt]);
  useEffect(() => {
    save('theme', theme);
  }, [theme]);
  useEffect(() => {
    save('view', view);
  }, [view]);
  useEffect(() => {
    save('favorites', JSON.stringify(favorites));
  }, [favorites]);
  const toggleFavorite = (item: GuestMenuItem) => {
    const key = favoriteKey(item);
    setFavorites((ids) => (ids.includes(key) ? ids.filter((id) => id !== key) : [...ids, key]));
  };
  return {
    language,
    setLanguage,
    ready: dictionary === language,
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

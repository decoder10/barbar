import { SettingsContext } from './settings-context';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configureMoney } from './currency/format-money';
import { setTranslations, t } from './i18n/runtime';
import {
  defaultPreferences,
  type Currency,
  type ExchangeRates,
  type Language,
  type Theme,
} from '../domain/identity/preferences';
import { PresentationContext } from './presentation-context';
import { useBar } from '../app/providers/BarProvider';
import { api } from '../services/api-client';
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, updatePreferences, notify } = useBar();
  const preferences = user?.preferences || defaultPreferences;
  const theme = preferences.theme || 'light';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const [language, setLanguage] = useState<Language>('ru');
  const [pending, setPending] = useState(false);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [rateError, setRateError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const messages =
        preferences.language === 'ru'
          ? {}
          : (await (preferences.language === 'hy' ? import('./i18n/hy.json') : import('./i18n/en.json')))
              .default;
      if (active) {
        setTranslations(preferences.language, messages);
        setLanguage(preferences.language);
      }
    };
    void load().catch(() => notify('Не удалось загрузить перевод. Повторите выбор языка.', true));
    return () => {
      active = false;
    };
  }, [preferences.language, notify]);
  useEffect(() => {
    if (preferences.currency === 'AMD') return;
    let active = true;
    async function load() {
      try {
        // The shared client: same timeout, JSON guard and coalescing as every other read.
        const next = await api('/api/barbar/rates');
        if (
          !next.date ||
          !['AMD', 'USD', 'EUR', 'RUB'].every(
            (key) =>
              Number.isFinite(next.amdPerUnit?.[key as Currency]) && next.amdPerUnit[key as Currency] > 0,
          )
        )
          throw new Error('Invalid rates');
        if (active) {
          setRates(next);
          setRateError(false);
        }
      } catch {
        if (active) {
          setRates(null);
          setRateError(true);
        }
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 3600000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [preferences.currency]);
  configureMoney(preferences.currency, language, rates);
  const update = useCallback(
    async (nextLanguage: Language, currency: Currency, nextTheme?: Theme) => {
      setPending(true);
      try {
        await updatePreferences({
          language: nextLanguage,
          currency,
          ...(nextTheme || preferences.theme ? { theme: nextTheme || preferences.theme } : {}),
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Не удалось сохранить настройки.', true);
      } finally {
        setPending(false);
      }
    },
    [notify, preferences.theme, updatePreferences],
  );
  const settings = useMemo(
    () => ({ language, currency: preferences.currency, theme, pending, rates, rateError, update }),
    [language, preferences.currency, theme, pending, rates, rateError, update],
  );
  return (
    <SettingsContext.Provider value={settings}>
      <PresentationContext.Provider value={`${language}:${preferences.currency}:${rates?.fetchedAt || ''}`}>
        <div key={`${user?.id || 'guest'}:${language}`} className="settings-root">
          {t(children)}
        </div>
      </PresentationContext.Provider>
    </SettingsContext.Provider>
  );
}

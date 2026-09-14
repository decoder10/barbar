import { Moon, Sun } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { configureMoney, displayCurrency } from './display-money';
import { setTranslations, t } from './i18n/runtime';
import {
  defaultPreferences,
  type Currency,
  type ExchangeRates,
  type Language,
  type Theme,
} from './preferences';
import { PresentationContext } from './presentation-context';
import { useBar } from './store';
const SettingsContext = createContext<{
  language: Language;
  currency: Currency;
  theme: Theme;
  pending: boolean;
  rates: ExchangeRates | null;
  rateError: boolean;
  update: (language: Language, currency: Currency, theme?: Theme) => Promise<void>;
} | null>(null);
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
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/barbar/rates', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error('Rates unavailable');
        const next = (await response.json()) as ExchangeRates;
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
      controller.abort();
      window.clearInterval(timer);
    };
  }, [preferences.currency]);
  configureMoney(preferences.currency, language, rates);
  const update = async (nextLanguage: Language, currency: Currency, nextTheme?: Theme) => {
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
  };
  return (
    <SettingsContext.Provider
      value={{ language, currency: preferences.currency, theme, pending, rates, rateError, update }}
    >
      <PresentationContext.Provider value={`${language}:${preferences.currency}:${rates?.fetchedAt || ''}`}>
        <div key={`${user?.id || 'guest'}:${language}`} className="settings-root">
          {t(children)}
        </div>
      </PresentationContext.Provider>
    </SettingsContext.Provider>
  );
}
export function PreferenceControls() {
  const settings = useContext(SettingsContext);
  const { role } = useBar();
  if (!settings) return null;
  return (
    <div className="preference-controls">
      <button
        type="button"
        className="theme-toggle"
        aria-label={t(settings.theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему')}
        title={t(settings.theme === 'light' ? 'Тёмная тема' : 'Светлая тема')}
        disabled={settings.pending}
        onClick={() =>
          void settings.update(
            settings.language,
            settings.currency,
            settings.theme === 'light' ? 'dark' : 'light',
          )
        }
      >
        {settings.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <label>
        <span className="visually-hidden">{t('Язык')}</span>
        <select
          aria-label={t('Язык')}
          disabled={settings.pending}
          value={settings.language}
          onChange={(e) => void settings.update(e.target.value as Language, settings.currency)}
        >
          <option value="ru">{t('Русский')}</option>
          <option value="hy">Հայերեն</option>
          <option value="en">English</option>
        </select>
      </label>
      {t(
        role === 'admin' && (
          <label>
            <span className="visually-hidden">{t('Валюта отображения')}</span>
            <select
              aria-label={t('Валюта отображения')}
              disabled={settings.pending}
              value={settings.currency}
              onChange={(e) => void settings.update(settings.language, e.target.value as Currency)}
            >
              {t(
                ['AMD', 'RUB', 'USD', 'EUR'].map((value) => (
                  <option value={value} key={value}>
                    {t(value)}
                  </option>
                )),
              )}
            </select>
          </label>
        ),
      )}
      {t(
        role === 'admin' && settings.currency !== 'AMD' && (
          <small className="rate-note">
            {t(
              settings.rates && !settings.rateError ? (
                <>
                  <a href="https://www.cba.am/en/exchange-rates-retrieval" target="_blank" rel="noreferrer">
                    {t('Курс ЦБ Армении')}
                  </a>{' '}
                  · {t(settings.rates.date)}
                </>
              ) : (
                t(settings.rateError ? 'Курс недоступен · показано AMD' : 'Загружаем курс · показано AMD')
              ),
            )}
            <br />
            {t('Ввод и учёт: AMD')} · {t(displayCurrency())}
          </small>
        ),
      )}
    </div>
  );
}

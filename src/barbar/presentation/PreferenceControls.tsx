import { LoadingStatus } from '../ui/loading';
import { Moon, Sun } from 'lucide-react';
import { useContext } from 'react';
import { displayCurrency } from './currency/format-money';
import { t } from './i18n/runtime';
import type { Currency, Language } from '../domain/identity/preferences';
import { useBar } from '../app/providers/BarProvider';
import { SettingsContext } from './settings-context';
export function PreferenceControls() {
  const settings = useContext(SettingsContext);
  const { role, busy } = useBar();
  if (!settings) return null;
  return (
    <div className="preference-controls" aria-busy={settings.pending}>
      {settings.pending && <LoadingStatus label="Сохраняем…" />}
      <button
        type="button"
        className="theme-toggle"
        aria-label={t(settings.theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему')}
        title={t(settings.theme === 'light' ? 'Тёмная тема' : 'Светлая тема')}
        disabled={settings.pending || busy}
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
          disabled={settings.pending || busy}
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
              disabled={settings.pending || busy}
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

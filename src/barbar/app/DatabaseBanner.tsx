import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../presentation/i18n/runtime';

type Environment = { database?: string; name?: string } | null;
let environment: Promise<Environment> | undefined;
/** Once per page load: the database profile cannot change without restarting the dev server. */
const loadEnvironment = () =>
  (environment ||= fetch('/api/barbar/environment', { cache: 'no-store' })
    .then((response) => (response.ok ? (response.json() as Promise<Environment>) : null))
    .catch(() => null));

/** Development server only: warns when the local app writes to the live Production database. */
export function DatabaseBanner() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let active = true;
    void loadEnvironment().then((value) => {
      if (active && value?.database === 'production') setName(value.name || 'barbar');
    });
    return () => {
      active = false;
    };
  }, []);
  if (!name) return null;
  return (
    <div className="database-banner" role="alert">
      <TriangleAlert size={16} aria-hidden="true" />
      <strong>{t('Рабочая база Production')}</strong>
      <span>
        {t('Локальный запуск подключён к БД')} «{name}».{' '}
        {t('Продажи, закупки и правки сохраняются по-настоящему.')}
      </span>
    </div>
  );
}

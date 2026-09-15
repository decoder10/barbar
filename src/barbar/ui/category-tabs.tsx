import { t } from '../presentation/i18n/runtime';

/** Segmented buttons on wide screens; a native dropdown on phones, where a long tab row does not fit. */
export function CategoryTabs({
  value,
  onChange,
  options,
  className,
  label = 'Категория',
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  className: string;
  label?: string;
}) {
  return (
    <div className="category-tabs">
      <div className={`${className} category-tabs-buttons`}>
        {options.map(([id, name]) => (
          <button
            key={id}
            type="button"
            className={value === id ? 'active' : ''}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {t(name)}
          </button>
        ))}
      </div>
      <label className="category-select">
        <span className="visually-hidden">{t(label)}</span>
        <select aria-label={t(label)} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([id, name]) => (
            <option key={id} value={id}>
              {t(name)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

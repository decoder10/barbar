import { t } from '../../presentation/i18n/runtime';

const categories = [
  ['all', 'Все'],
  ['alcohol', 'Алкоголь в розлив'],
  ['beer', 'Пиво'],
  ['wine', 'Вино'],
  ['cognac', 'Коньяк'],
  ['mixer', 'Продукты и миксеры'],
];

export function InventoryCategories({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented inventory-categories">
      {categories.map(([id, label]) => (
        <button
          key={id}
          className={value === id ? 'active' : ''}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

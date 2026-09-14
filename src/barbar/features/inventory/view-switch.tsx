import { LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n/runtime';

export function useInventoryView() {
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try {
      return localStorage.getItem('barbar-inventory-view') === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  return [
    view,
    (value: 'list' | 'grid') => {
      setView(value);
      try {
        localStorage.setItem('barbar-inventory-view', value);
      } catch {
        /* Private browsing may disable storage. */
      }
    },
  ] as const;
}

export function InventoryViewSwitch({
  view,
  onChange,
}: {
  view: 'list' | 'grid';
  onChange: (value: 'list' | 'grid') => void;
}) {
  return (
    <div className="segmented inventory-view-switch" role="group" aria-label={t('Вид склада')}>
      <button
        type="button"
        aria-pressed={view === 'list'}
        className={view === 'list' ? 'active' : ''}
        onClick={() => onChange('list')}
      >
        <List size={17} />
        {t(' Список')}
      </button>
      <button
        type="button"
        aria-pressed={view === 'grid'}
        className={view === 'grid' ? 'active' : ''}
        onClick={() => onChange('grid')}
      >
        <LayoutGrid size={17} />
        {t(' Сетка')}
      </button>
    </div>
  );
}

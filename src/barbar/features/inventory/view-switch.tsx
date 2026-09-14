import { LayoutGrid, List } from 'lucide-react';
import { useSessionFilter } from '../../presentation/use-session-filter';
import { t } from '../../presentation/i18n/runtime';

export function useInventoryView() {
  return useSessionFilter<'list' | 'grid'>(
    'inventory-view',
    'list',
    (value): value is 'list' | 'grid' => value === 'list' || value === 'grid',
  );
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

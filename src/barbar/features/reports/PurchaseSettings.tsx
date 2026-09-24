import { Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { uid, unitLabel } from '../../domain/model';
import type { Alcohol, Supplier } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { BusyButton } from '../../ui/loading';
import { Sheet } from '../../ui/sheet';

/** A labelled control of a settings row; the control carries its own accessible name. */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field compact-field">
      <span aria-hidden="true">{t(label)}</span>
      {children}
    </div>
  );
}
const days = (value: string) => (value.trim() === '' ? undefined : Number(value));
const text = (value: number | undefined) => (value === undefined ? '' : String(value));

/** One supplier: its name, default lead time in days and a note. */
function SupplierRow({ supplier }: { supplier?: Supplier }) {
  const { run, busy } = useBar();
  const [name, setName] = useState(supplier?.name || '');
  const [lead, setLead] = useState(text(supplier?.leadDays));
  const [note, setNote] = useState(supplier?.note || '');
  const dirty =
    !supplier || name !== supplier.name || lead !== text(supplier.leadDays) || note !== (supplier.note || '');
  const valid = name.trim().length > 0 && (lead === '' || /^\d{1,3}$/.test(lead));
  return (
    <div className="purchase-settings-row supplier-row">
      <Labelled label="Название поставщика">
        <input
          aria-label={t('Название поставщика')}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Labelled>
      <Labelled label="Срок поставки, дней">
        <input
          aria-label={t('Срок поставки, дней')}
          type="number"
          min="0"
          max="365"
          step="1"
          placeholder={t('не задано')}
          value={lead}
          onChange={(e) => setLead(e.target.value)}
        />
      </Labelled>
      <Labelled label="Заметка">
        <input
          aria-label={t('Заметка')}
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Labelled>
      <div className="row-actions">
        <BusyButton
          type="button"
          className="button secondary"
          busy={busy}
          disabled={!dirty || !valid}
          onClick={async () => {
            const ok = await run(
              {
                type: 'saveSupplier',
                value: {
                  id: supplier?.id || `supplier-${uid()}`,
                  name: name.trim(),
                  ...(days(lead) !== undefined ? { leadDays: days(lead) } : {}),
                  ...(note.trim() ? { note: note.trim() } : {}),
                },
              },
              'Поставщик сохранён.',
            );
            if (ok && !supplier) {
              setName('');
              setLead('');
              setNote('');
            }
          }}
        >
          {t(supplier ? 'Сохранить' : 'Добавить')}
        </BusyButton>
        {supplier && (
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            aria-label={`${t('Удалить поставщика')}: ${supplier.name}`}
            title={t('Удалить поставщика')}
            onClick={() => void run({ type: 'removeSupplier', supplierId: supplier.id }, 'Поставщик удалён.')}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Purchasing parameters of one item; an empty value means «not set» and the default applies. */
function ItemRow({ item, suppliers }: { item: Alcohol; suppliers: Supplier[] }) {
  const { run, busy } = useBar();
  const [supplierId, setSupplierId] = useState(item.supplierId || '');
  const [lead, setLead] = useState(text(item.leadDays));
  const [safetyDays, setSafetyDays] = useState(text(item.safetyDays));
  const [safetyStock, setSafetyStock] = useState(text(item.safetyStock));
  const dirty =
    supplierId !== (item.supplierId || '') ||
    lead !== text(item.leadDays) ||
    safetyDays !== text(item.safetyDays) ||
    safetyStock !== text(item.safetyStock);
  const valid =
    [lead, safetyDays].every((v) => v === '' || /^\d{1,3}$/.test(v)) &&
    (safetyStock === '' || (Number.isFinite(Number(safetyStock)) && Number(safetyStock) >= 0));
  const unit = t(unitLabel(item.unit));
  return (
    <div className="purchase-settings-row item-row">
      <strong>{item.name}</strong>
      <Labelled label="Поставщик">
        <select
          aria-label={`${t('Поставщик')}: ${item.name}`}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">{t('не задано')}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Срок поставки, дней">
        <input
          aria-label={`${t('Срок поставки, дней')}: ${item.name}`}
          type="number"
          min="0"
          max="365"
          step="1"
          placeholder={t('не задано')}
          value={lead}
          onChange={(e) => setLead(e.target.value)}
        />
      </Labelled>
      <Labelled label="Страховые дни">
        <input
          aria-label={`${t('Страховые дни')}: ${item.name}`}
          type="number"
          min="0"
          max="365"
          step="1"
          placeholder={t('не задано')}
          value={safetyDays}
          onChange={(e) => setSafetyDays(e.target.value)}
        />
      </Labelled>
      <Labelled label={`${t('Страховой запас')}, ${unit}`}>
        <input
          aria-label={`${t('Страховой запас')}, ${unit}: ${item.name}`}
          type="number"
          min="0"
          step="any"
          placeholder={t('не задано')}
          value={safetyStock}
          onChange={(e) => setSafetyStock(e.target.value)}
        />
      </Labelled>
      <div className="row-actions">
        <BusyButton
          type="button"
          className="button secondary"
          busy={busy}
          disabled={!dirty || !valid}
          onClick={() => {
            // Empty fields leave the item without the value, so the supplier or the default applies again.
            const value: Alcohol = { ...item };
            delete value.supplierId;
            delete value.leadDays;
            delete value.safetyDays;
            delete value.safetyStock;
            void run(
              {
                type: 'alcohol',
                value: {
                  ...value,
                  ...(supplierId ? { supplierId } : {}),
                  ...(days(lead) !== undefined ? { leadDays: days(lead) } : {}),
                  ...(days(safetyDays) !== undefined ? { safetyDays: days(safetyDays) } : {}),
                  ...(safetyStock !== '' ? { safetyStock: Number(safetyStock) } : {}),
                },
              },
              'Параметры закупки сохранены.',
            );
          }}
        >
          {t('Сохранить')}
        </BusyButton>
      </div>
    </div>
  );
}

/** Suppliers and per-item purchasing parameters. Nothing is filled in for the owner: empty means «not set». */
export function PurchaseSettings({ suppliers, close }: { suppliers: Supplier[]; close: () => void }) {
  const { data } = useBar();
  const [search, setSearch] = useState('');
  const items = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return data.alcohol
      .filter((a) => !term || a.name.toLocaleLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [data.alcohol, search]);
  return (
    <Sheet
      title="Параметры закупок"
      subtitle="Срок поставки и страховой запас. Пустое значение — «не задано»: тогда действуют общие значения."
      close={close}
    >
      <section className="purchase-settings">
        <h3>{t('Поставщики')}</h3>
        {suppliers.map((s) => (
          <SupplierRow key={`${s.id}:${s.name}:${s.leadDays}:${s.note}`} supplier={s} />
        ))}
        <SupplierRow />
        <h3>{t('Позиции')}</h3>
        <div className="field compact-field">
          <input
            aria-label={t('Поиск позиции')}
            placeholder={t('Найти позицию…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {items.map((item) => (
          <ItemRow
            key={`${item.id}:${item.supplierId}:${item.leadDays}:${item.safetyDays}:${item.safetyStock}`}
            item={item}
            suppliers={suppliers}
          />
        ))}
      </section>
    </Sheet>
  );
}

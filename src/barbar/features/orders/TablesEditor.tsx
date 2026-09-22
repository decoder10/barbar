import { Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { uid } from '../../domain/model';
import type { BarTable, Order } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { Field } from '../../ui/fields';
import { BusyButton } from '../../ui/loading';
import { Modal } from '../../ui/modal';

/** Owner's table list: add, rename, switch off. A table with an open receipt cannot be switched off. */
export function TablesEditor({
  tables,
  orders,
  close,
}: {
  tables: BarTable[];
  orders: Order[];
  close: () => void;
}) {
  const { run, busy } = useBar();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<BarTable | null>(null);
  const busyTables = new Set(orders.map((o) => o.tableId));
  const save = (table: Pick<BarTable, 'id' | 'name' | 'order' | 'active'>, message: string) =>
    run({ type: 'saveTable', value: table }, message);
  return (
    <Modal title="Столы" subtitle="Названия столов на доске и на QR-карточках" close={close}>
      <form
        className="tables-editor-add"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          if (
            await save(
              { id: `table-${uid().slice(0, 8)}`, name: trimmed, order: tables.length, active: true },
              'Стол добавлен.',
            )
          )
            setName('');
        }}
      >
        <Field label="Новый стол">
          <input
            value={name}
            maxLength={40}
            placeholder={t('Например: 1, 2, Бар, Терраса')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <BusyButton type="submit" className="button primary" busy={busy} disabled={busy || !name.trim()}>
          <Plus size={16} /> {t('Добавить')}
        </BusyButton>
      </form>
      <div className="tables-editor-list">
        {!tables.length && <p className="form-help">{t('Пока нет ни одного стола. Добавьте первый.')}</p>}
        {tables.map((table) => (
          <div className={`tables-editor-row ${table.active ? '' : 'inactive'}`} key={table.id}>
            {renaming?.id === table.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = renaming.name.trim();
                  if (!trimmed) return;
                  if (await save({ ...table, name: trimmed }, 'Стол переименован.')) setRenaming(null);
                }}
              >
                <input
                  aria-label={t('Название стола')}
                  value={renaming.name}
                  maxLength={40}
                  autoFocus
                  onChange={(e) => setRenaming({ id: table.id, name: e.target.value })}
                />
                <button type="submit" className="button primary small" disabled={busy}>
                  {t('Сохранить')}
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => setRenaming(null)}
                >
                  {t('Отмена')}
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  className="tables-editor-name"
                  disabled={busy}
                  onClick={() => setRenaming({ id: table.id, name: table.name })}
                  title={t('Переименовать')}
                >
                  <strong>{table.name}</strong>
                  <small>
                    {t(table.active ? (busyTables.has(table.id) ? 'Открыт заказ' : 'Свободен') : 'Отключён')}
                  </small>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy || busyTables.has(table.id)}
                  aria-label={t(
                    table.active ? `Отключить стол ${table.name}` : `Включить стол ${table.name}`,
                  )}
                  title={t(
                    busyTables.has(table.id)
                      ? 'Сначала закройте заказ'
                      : table.active
                        ? 'Отключить'
                        : 'Включить',
                  )}
                  onClick={() =>
                    void save(
                      { ...table, active: !table.active },
                      table.active ? 'Стол отключён.' : 'Стол включён.',
                    )
                  }
                >
                  {table.active ? <PowerOff size={16} /> : <Power size={16} />}
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  disabled={busy || busyTables.has(table.id)}
                  aria-label={t(`Удалить стол ${table.name}`)}
                  title={t(busyTables.has(table.id) ? 'Сначала закройте заказ' : 'Удалить стол')}
                  onClick={() => setRemoving(table)}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {removing && (
        <Modal title="Удалить стол?" subtitle={removing.name} close={() => setRemoving(null)}>
          <p className="modal-text">
            {t(
              'Стол исчезнет с доски, а его QR-код перестанет работать. Прошлые заказы и продажи останутся в истории.',
            )}
          </p>
          <BusyButton
            type="button"
            className="button primary full"
            busy={busy}
            onClick={async () => {
              if (await run({ type: 'removeTable', tableId: removing.id }, 'Стол удалён.')) setRemoving(null);
            }}
          >
            <Trash2 size={16} /> {t('Удалить стол')}
          </BusyButton>
        </Modal>
      )}
    </Modal>
  );
}

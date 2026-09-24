import { Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { barConfig } from '../../config';
import {
  draftCommandLines,
  draftLineTotal,
  draftTotal,
  ownerCatalog,
  repeatDraft,
  staffCatalog,
  type RecentOrder,
  type RepeatLine,
} from '../../domain/orders/repeat';
import { api } from '../../services/api-client';
import { formatMoney as money } from '../../presentation/currency/format-money';
import { businessTimeLabel } from '../../presentation/format-date';
import { t } from '../../presentation/i18n/runtime';
import { BusyButton, LoadingStatus } from '../../ui/loading';
import { Empty } from '../../ui/layout';
import { Sheet } from '../../ui/sheet';
import { useInventoryCalculations } from '../inventory/use-inventory-calculations';

type Source = 'mine' | 'table' | 'history';
const step = (line: Pick<RepeatLine, 'kind'>) =>
  line.kind === 'alcohol' ? barConfig.guest.pouredAlcohol.portionMl : 1;
const statusText: Record<RepeatLine['status'], string> = {
  ok: '',
  reduced: 'Осталось меньше, чем было',
  unavailable: 'Нет в наличии',
  removed: 'Снято с продажи',
};

/**
 * Repeats a previous set on the current receipt: the user's last receipt, the table's last receipt or one
 * from the history. Prices and stock are today's; the set can be changed before it is saved, and it is
 * saved as one command, so a repeated tap does not add it twice.
 */
export function RepeatOrderSheet({
  orderId,
  tableId,
  close,
  onDone,
}: {
  /** An open receipt to add to. Otherwise the table's open receipt is used, or a new one is opened. */
  orderId?: string;
  tableId?: string;
  close: () => void;
  onDone: (result: { id: string }) => void;
}) {
  const { data, staffData, role, run, busy } = useBar();
  const inventory = useInventoryCalculations(data);
  const [source, setSource] = useState<Source>('mine');
  const [chosen, setChosen] = useState<string | null>(null);
  const [lists, setLists] = useState<{ mine: RecentOrder[]; table: RecentOrder[] } | null>(null);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const mine = await api('/api/barbar/orders/recent?scope=mine&limit=20');
        const table = tableId
          ? await api(`/api/barbar/orders/recent?scope=table&tableId=${encodeURIComponent(tableId)}&limit=20`)
          : { orders: [] };
        if (active) setLists({ mine: mine.orders, table: table.orders });
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить историю заказов.');
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [tableId]);
  const history = useMemo(() => {
    const byId = new Map([...(lists?.mine || []), ...(lists?.table || [])].map((o) => [o.id, o]));
    return [...byId.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }, [lists]);
  const order =
    source === 'mine'
      ? lists?.mine[0]
      : source === 'table'
        ? lists?.table[0]
        : history.find((o) => o.id === chosen);
  const lookup = useMemo(
    () =>
      role === 'admin' ? ownerCatalog(data, inventory.quantities) : staffCatalog(staffData?.products || []),
    [role, data, inventory.quantities, staffData?.products],
  );
  const base = useMemo(() => (order ? repeatDraft(order.lines, lookup) : []), [order, lookup]);
  // The user's changes on top of today's set: a quantity within stock, or a removed line.
  const lines = useMemo(
    () =>
      base
        .filter((line) => !removed.has(line.key))
        .map((line) => {
          if (line.quantity === 0 || edits[line.key] === undefined) return line;
          const entry = lookup(line.kind, line.productId, line.servingMl);
          const left =
            entry?.available === null || entry?.available === undefined ? Infinity : entry.available;
          return { ...line, quantity: Math.max(0, Math.min(edits[line.key], left)) };
        }),
    [base, edits, removed, lookup],
  );
  const total = draftTotal(lines);
  const commandLines = draftCommandLines(lines);
  const pick = (next: Source, id: string | null = null) => {
    setSource(next);
    setChosen(id);
    setEdits({});
    setRemoved(new Set());
  };
  const change = (line: RepeatLine, delta: number) =>
    setEdits((current) => ({
      ...current,
      [line.key]: Math.max(step(line), line.quantity + delta * step(line)),
    }));
  const tabs: [Source, string][] = [
    ['mine', 'Мой последний'],
    ...(tableId ? ([['table', 'Последний у стола']] as [Source, string][]) : []),
    ['history', 'Из истории'],
  ];
  return (
    <Sheet
      title="Повторить заказ"
      subtitle="Цены и наличие — на сегодня. Набор можно изменить до добавления."
      close={close}
    >
      <div className="repeat-tabs" role="tablist" aria-label={t('Что повторить')}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={source === id}
            className={source === id ? 'active' : ''}
            onClick={() => pick(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {error && <p role="alert">{t(error)}</p>}
      {!lists && !error && <LoadingStatus label="Загружаем историю…" />}
      {lists && source === 'history' && (
        <div className="repeat-history" role="listbox" aria-label={t('История заказов')}>
          {history.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={chosen === o.id}
              className={chosen === o.id ? 'active' : ''}
              onClick={() => pick('history', o.id)}
            >
              <span>{businessTimeLabel(o.closedAt || o.openedAt)}</span>
              <small>{o.lines.map((l) => l.name).join(', ')}</small>
              <b>{o.total === undefined ? '' : t(money(o.total))}</b>
            </button>
          ))}
          {!history.length && <Empty title={t('История пуста')} text="Оплаченных заказов пока нет." />}
        </div>
      )}
      {lists && source !== 'history' && !order && (
        <Empty
          title={t(
            source === 'mine' ? 'У вас ещё нет оплаченных заказов' : 'У стола ещё нет оплаченных заказов',
          )}
          text="Выберите другой вариант или соберите заказ из каталога."
        />
      )}
      {order && (
        <div className="repeat-lines">
          <p className="muted">
            {t('Заказ от')} {businessTimeLabel(order.closedAt || order.openedAt)}
          </p>
          {lines.map((line) => (
            <div key={line.key} className={`repeat-line ${line.status}`}>
              <div>
                <strong>{line.name}</strong>
                <small>
                  {line.status === 'ok' || line.status === 'reduced'
                    ? `${line.quantity}${line.kind === 'alcohol' ? ` ${t('мл')}` : ''} × ${money(line.unitPrice)}`
                    : t(statusText[line.status])}
                  {line.status === 'reduced' && ` · ${t(statusText.reduced)} (${t('было')} ${line.wanted})`}
                </small>
              </div>
              <b>{line.quantity > 0 ? t(money(draftLineTotal(line))) : '—'}</b>
              <span className="line-stepper">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${t('Меньше')}: ${line.name}`}
                  disabled={line.quantity <= step(line)}
                  onClick={() => change(line, -1)}
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${t('Больше')}: ${line.name}`}
                  disabled={line.quantity === 0}
                  onClick={() => change(line, 1)}
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${t('Убрать')}: ${line.name}`}
                  title={t('Убрать')}
                  onClick={() => setRemoved((current) => new Set(current).add(line.key))}
                >
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          ))}
          {!lines.length && <p className="muted">{t('Все позиции убраны из набора.')}</p>}
          <div className="receipt-total">
            <span>
              {t('Итого')}
              <strong>{t(money(total))}</strong>
            </span>
          </div>
          <BusyButton
            type="button"
            className="button primary full"
            busy={busy}
            disabled={!commandLines.length}
            onClick={async () => {
              const result = await run(
                {
                  type: 'addLines',
                  ...(orderId ? { orderId } : tableId ? { tableId } : {}),
                  lines: commandLines,
                  expectedTotal: total,
                },
                'Набор добавлен в заказ.',
              );
              if (result) onDone(result);
            }}
          >
            {t('Добавить в заказ')} · {money(total)}
          </BusyButton>
        </div>
      )}
    </Sheet>
  );
}

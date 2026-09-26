import { LoadingStatus } from '../ui/loading';
import { useEffect, useState } from 'react';
import { PageHeading } from '../ui/layout';
import { Field } from '../ui/fields';
import { api } from '../services/api-client';
import type { AuditEvent } from '../domain/identity/audit';
import { useUsers } from '../features/users/use-users';
import { useSessionFilter } from '../presentation/use-session-filter';
import { t, locale } from '../presentation/i18n/runtime';
const actions: Record<string, string> = {
  count: 'Инвентаризация',
  writeoff: 'Списание',
  prepare: 'Выпуск заготовки',
  expense: 'Расход бара',
  voidExpense: 'Отмена расхода',
  sale: 'Продажа',
  void: 'Отмена продажи',
  removeLine: 'Позиция убрана из заказа',
  purchase: 'Закупка',
  correctPurchase: 'Исправление закупки',
  resetStock: 'Сброс остатка',
  alcohol: 'Изменение склада',
  cocktail: 'Изменение меню',
  createCocktail: 'Создание коктейля',
  updateRecipe: 'Редактирование рецепта',
  restore: 'Восстановление данных',
  purge: 'Архивация',
  saveTable: 'Стол',
  removeTable: 'Удаление стола',
  openOrder: 'Открытие заказа',
  payOrder: 'Оплата заказа',
  cancelOrder: 'Отмена заказа',
  'user.create': 'Создание пользователя',
  'user.update': 'Изменение пользователя',
  'user.access': 'Изменение доступа',
  'user.password': 'Смена пароля',
};
export default function Audit() {
  const [actor, setActor] = useSessionFilter('actor', '', (v): v is string => typeof v === 'string');
  const [action, setAction] = useSessionFilter('action', '', (v): v is string => typeof v === 'string');
  // The same loader as «Пользователи»: a failed team list is shown, not swallowed.
  const { users, error: usersError } = useUsers();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ actor, action, ...(cursor ? { cursor } : {}) });
    void api(`/api/barbar/audit?${params}`)
      .then((r) => {
        if (!cancelled) {
          setEvents(r.events);
          setNext(r.nextCursor);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actor, action, cursor]);
  return (
    <>
      <PageHeading title={t('Журнал действий')} />
      <section className="panel">
        <div className="form-grid">
          <Field label="Сотрудник">
            <select
              value={actor}
              onChange={(e) => {
                setActor(e.target.value);
                setCursor(null);
              }}
            >
              <option value="">{t('Все')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Действие">
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setCursor(null);
              }}
            >
              <option value="">{t('Все')}</option>
              {Object.entries(actions).map(([id, name]) => (
                <option key={id} value={id}>
                  {t(name)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {usersError && <p role="alert">{t(usersError)}</p>}
        {error && <p role="alert">{t(error)}</p>}
        {loading ? (
          <LoadingStatus />
        ) : (
          <div className="table-scroll">
            <table className="data-table operations-table">
              <thead>
                <tr>
                  <th>{t('Время')}</th>
                  <th>{t('Сотрудник')}</th>
                  <th>{t('Действие')}</th>
                  <th>{t('Подробности')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString(locale(), { timeZone: 'Asia/Yerevan' })}</td>
                    <td>{e.actor.fullName}</td>
                    <td>{t(actions[e.action] || e.action)}</td>
                    <td>{t(e.summary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!events.length && <p>{t('Действий пока нет.')}</p>}
          </div>
        )}
        <div className="operation-toolbar">
          <button className="button secondary" disabled={!cursor || loading} onClick={() => setCursor(null)}>
            {t('В начало')}
          </button>
          <button className="button secondary" disabled={!next || loading} onClick={() => setCursor(next)}>
            {t('Следующие 50')}
          </button>
        </div>
      </section>
    </>
  );
}

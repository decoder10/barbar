import { Pencil, Plus, ShieldCheck, UserRound, Users as UsersIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Field } from '../ui/fields';
import { LoadingStatus } from '../ui/loading';
import { Modal, Submit } from '../ui/modal';
import { PageHeading } from '../ui/layout';
import { t } from '../presentation/i18n/runtime';
import { api } from '../services/api-client';
import { useBar } from '../app/providers/BarProvider';
import type { UserInput, UserProfile } from '../domain/identity/user';
import { useUsers } from '../features/users/use-users';
const blank: UserInput = { username: '', fullName: '', email: '', phone: '', password: '', role: 'worker' };
export default function Users() {
  const { user: me, notify, perform, busy: saving } = useBar();
  const { users, setUsers, loading, error: loadError, reload: load } = useUsers();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [active, setActive] = useState(true);
  const [form, setForm] = useState<UserInput>(blank);
  const [error, setError] = useState('');
  const field = (key: keyof UserInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function create(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    try {
      const result = await perform(() =>
        api('/api/barbar/users', {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify({ ...form, ...(editing ? { id: editing.id, active } : {}) }),
        }),
      );
      if (!result) return;
      setUsers((current) =>
        editing ? current.map((u) => (u.id === editing.id ? result.user : u)) : [...current, result.user],
      );
      setForm(blank);
      setOpen(false);
      notify(
        editing
          ? 'Пользователь обновлён. При изменении доступа или пароля старые сеансы завершены.'
          : 'Пользователь создан. Он может войти со своим логином и паролем.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось создать пользователя.');
    }
  }
  return (
    <>
      <PageHeading title={t('Пользователи')}>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setActive(true);
            setForm(blank);
            setError('');
            setOpen(true);
          }}
        >
          <Plus size={18} />
          {t('Новый пользователь')}
        </button>
      </PageHeading>
      <div className="user-role-guide">
        <div>
          <ShieldCheck size={22} />
          <span>
            <strong>{t('Владелец')}</strong>
            <small>{t('Все разделы, финансы, закупки и создание пользователей.')}</small>
          </span>
        </div>
        <div>
          <UserRound size={22} />
          <span>
            <strong>{t('Работник')}</strong>
            <small>{t('Продажи, рецепты и просмотр остатков. Без цен, финансов и изменения склада.')}</small>
          </span>
        </div>
      </div>
      <section className="panel users-panel">
        <div className="section-heading">
          <h2>
            <UsersIcon size={20} />
            {t(' Команда')}
            <span className="muted">{t(users.length || '')}</span>
          </h2>
        </div>
        {t(
          loading ? (
            <LoadingStatus label="Загружаем пользователей…" />
          ) : loadError ? (
            <div role="alert">
              <p>{t(loadError)}</p>
              <button className="button secondary" onClick={() => void load()}>
                {t('Повторить')}
              </button>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>{t('Имя и логин')}</th>
                    <th>{t('Роль')}</th>
                    <th>{t('Контакты')}</th>
                    <th>{t('Доступ')}</th>
                    <th>{t('Действия')}</th>
                  </tr>
                </thead>
                <tbody>
                  {t(
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="user-name">
                            <span className="avatar">{t(user.fullName.slice(0, 1).toUpperCase())}</span>
                            <div>
                              <strong>
                                {t(user.fullName)}
                                {t(user.id === me?.id && <small className="user-self">{t(' · Вы')}</small>)}
                              </strong>
                              <small>@{t(user.username)}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`user-role ${user.role}`}>
                            {t(user.role === 'owner' ? <ShieldCheck size={14} /> : <UserRound size={14} />)}
                            {t(' ')}
                            {t(user.role === 'owner' ? 'Владелец' : 'Работник')}
                          </span>
                        </td>
                        <td>
                          <div className="user-contacts">
                            <span>{t(user.email || '—')}</span>
                            <small>{t(user.phone || '—')}</small>
                          </div>
                        </td>
                        <td>{t(user.active ? 'Активен' : 'Отключён')}</td>
                        <td>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setEditing(user);
                              setForm({ ...user, password: '' });
                              setActive(user.active);
                              setError('');
                              setOpen(true);
                            }}
                          >
                            <Pencil size={16} />
                            {t('Редактировать')}
                          </button>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ),
        )}
      </section>
      {t(
        open && (
          <Modal
            title={t(editing ? 'Редактирование пользователя' : 'Новый пользователь')}
            subtitle="Укажите данные для входа и роль в команде."
            close={() => {
              if (!saving) {
                setOpen(false);
                setForm(blank);
              }
            }}
          >
            <form onSubmit={create} className="user-form">
              <Field label="Имя и фамилия">
                <input
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={form.fullName}
                  onChange={(e) => field('fullName', e.target.value)}
                  placeholder={t('Например, Арам Мкртчян')}
                />
              </Field>
              <div className="form-grid">
                <Field label="Логин" hint="Латинские буквы, цифры, точки, дефисы и _">
                  <input
                    autoComplete="off"
                    required
                    minLength={3}
                    maxLength={64}
                    pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}"
                    value={form.username}
                    onChange={(e) => field('username', e.target.value)}
                    placeholder="aram"
                  />
                </Field>
                <Field label="Роль">
                  <select
                    disabled={editing?.id === me?.id}
                    value={form.role}
                    onChange={(e) => field('role', e.target.value)}
                  >
                    <option value="worker">{t('Работник')}</option>
                    <option value="owner">{t('Владелец')}</option>
                  </select>
                </Field>
              </div>
              <div className="form-grid">
                <Field label="Email (необязательно)">
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={form.email}
                    onChange={(e) => field('email', e.target.value)}
                  />
                </Field>
                <Field label="Телефон (необязательно)">
                  <input
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    value={form.phone}
                    onChange={(e) => field('phone', e.target.value)}
                  />
                </Field>
              </div>
              {editing && (
                <Field label="Доступ">
                  <select
                    disabled={editing.id === me?.id}
                    value={active ? 'active' : 'blocked'}
                    onChange={(e) => setActive(e.target.value === 'active')}
                  >
                    <option value="active">{t('Активен')}</option>
                    <option value="blocked">{t('Отключён')}</option>
                  </select>
                </Field>
              )}
              <Field
                label={editing ? 'Новый пароль' : 'Пароль'}
                hint={
                  editing
                    ? 'Оставьте пустым, чтобы сохранить пароль. Новый пароль завершит все старые сеансы.'
                    : 'От 12 символов. Передайте логин и пароль сотруднику.'
                }
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  required={!editing}
                  minLength={12}
                  maxLength={128}
                  value={form.password}
                  onChange={(e) => field('password', e.target.value)}
                />
              </Field>
              {t(
                error && (
                  <div className="modal-error" role="alert">
                    {t(error)}
                  </div>
                ),
              )}
              <Submit>{t(editing ? 'Сохранить изменения' : 'Создать пользователя')}</Submit>
            </form>
          </Modal>
        ),
      )}
    </>
  );
}

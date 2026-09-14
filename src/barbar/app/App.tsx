import { StockNotifications } from '../features/notifications/StockNotifications';
import { useRouteScroll } from './use-route-scroll';
import { LoadingStatus } from '../ui/loading';
import {
  History,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Files,
  GlassWater,
  LogOut,
  Menu,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Brand } from '../ui/layout';
import { Login } from '../features/auth/Login';
import { t } from '../presentation/i18n/runtime';
import { PreferenceControls } from '../presentation/PreferenceControls';
import { useBar } from './providers/BarProvider';
const Operations = lazy(() => import('../pages/Operations'));
const Audit = lazy(() => import('../pages/Audit'));
const Users = lazy(() => import('../pages/Users'));
const StaffRecipes = lazy(() => import('../pages/StaffRecipes'));
const StaffInventory = lazy(() => import('../pages/StaffInventory'));
const StaffSales = lazy(() => import('../pages/StaffSales'));
const Sales = lazy(() => import('../pages/Sales'));
const Inventory = lazy(() => import('../pages/Inventory'));
const Cocktails = lazy(() => import('../pages/Cocktails'));
const Reports = lazy(() => import('../pages/Reports'));
const Backups = lazy(() => import('../pages/Backups'));
const navigation = [
  { path: '/', label: 'Продажи', icon: ShoppingBag, caption: 'Каждый день' },
  { path: '/inventory', label: 'Склад', icon: Boxes, caption: 'Напитки и закупки' },
  { path: '/cocktails', label: 'Меню и рецепты', icon: GlassWater, caption: 'Коктейли, настойки и всё меню' },
  { path: '/reports', label: 'Отчёты', icon: BarChart3, caption: 'Всё в цифрах' },
  { path: '/operations', label: 'Операции и расходы', icon: Boxes, caption: 'Пересчёт, списания, заготовки' },
  { path: '/audit', label: 'Журнал действий', icon: History, caption: 'История изменений' },
  { path: '/users', label: 'Пользователи', icon: UsersIcon, caption: 'Команда и роли' },
  { path: '/files', label: 'Данные и копии', icon: Files, caption: 'Ваши данные' },
];
export default function App() {
  const { mode, role, user, notice, logout, refresh, connected, busy, activity, syncing, hasData } = useBar();
  const { pathname } = useLocation();
  useRouteScroll(pathname);
  const [menu, setMenu] = useState(false);
  if (mode === 'loading') {
    return (
      <div className="app-loading">
        <Brand />
        <span className="spinner" />
        <p>{t('Открываем ваш бар…')}</p>
      </div>
    );
  }
  if (mode === 'login') {
    return <Login />;
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        {t('Перейти к содержимому')}
      </a>
      {t(
        menu && (
          <button className="sidebar-scrim" aria-label={t('Закрыть меню')} onClick={() => setMenu(false)} />
        ),
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`} inert={busy}>
        <div className="sidebar-brand">
          <Brand onNavigate={() => setMenu(false)} />
          <button
            className="mobile-close icon-button"
            aria-label={t('Закрыть меню')}
            onClick={() => setMenu(false)}
          >
            <X size={21} />
          </button>
        </div>
        <div className="workspace-label">
          <span />
          {t(' УПРАВЛЕНИЕ БАРОМ')}
        </div>
        <nav aria-label={t('Основная навигация')}>
          {t(
            navigation
              .filter((item) => role === 'admin' || ['/', '/inventory', '/cocktails'].includes(item.path))
              .map(({ path, label, icon: Icon, caption }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  onClick={() => setMenu(false)}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon size={20} />
                  <span>
                    {t(label)}
                    <small>
                      {t(role === 'barbar' && path === '/inventory' ? 'Наличие и остатки' : caption)}
                    </small>
                  </span>
                  <ChevronRight size={14} className="nav-arrow" />
                </NavLink>
              )),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={21} />
            <h3>
              {t('Меньше рутины.')}
              <br />
              {t('Больше хороших вечеров.')}
            </h3>
            <p>
              {t('Все цифры здесь.')}
              <br />
              {t('Вы — ближе к гостям.')}
            </p>
            <span>THAT'S THE SPIRIT ↗</span>
          </div>
          <div className="sidebar-footer">
            <span className="avatar">B</span>
            <div>
              <strong>{t(user?.fullName || 'Barbar Cafe')}</strong>
              <small>{t(role === 'admin' ? 'Владелец' : 'Работник')}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t('Выйти')}
              disabled={busy}
              onClick={() => {
                void logout();
              }}
            >
              {activity === 'Выходим…' ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <LogOut size={17} />
              )}
            </button>
          </div>
          <a
            className="photo-credits-link"
            href="/barbar/photos/credits.html"
            target="_blank"
            rel="noreferrer"
          >
            {t('Источники фотографий')}
          </a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label={t('Открыть меню')}
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span>{t('Рабочее пространство')}</span>
            <ChevronRight size={13} />
            <strong>{t(navigation.find((n) => n.path === pathname)?.label || 'Barbar')}</strong>
          </div>
          <div className="topbar-right">
            <span className={`sync-status ${connected ? '' : 'offline'}`}>
              <Cloud size={16} />
              <span>{t(syncing ? 'Обновляем…' : connected ? 'Общие данные' : 'Нет связи')}</span>
            </span>
            {t(
              mode === 'cloud' && (
                <button
                  className="icon-button"
                  aria-label={t('Обновить данные')}
                  aria-busy={syncing}
                  disabled={busy || syncing}
                  onClick={() => {
                    void refresh();
                  }}
                >
                  <RefreshCw size={16} className={syncing ? 'is-spinning' : ''} />
                </button>
              ),
            )}
            <span className="currency-tag">
              <PreferenceControls />
            </span>
          </div>
        </header>
        <main id="content" className="page-content" inert={busy} aria-busy={busy}>
          {!hasData ? (
            connected ? (
              <LoadingStatus label="Открываем ваш бар…" />
            ) : (
              <div role="alert">
                {t('Не удалось обновить данные.')}
                <button className="button secondary" disabled={syncing} onClick={() => void refresh()}>
                  {t('Повторить')}
                </button>
              </div>
            )
          ) : (
            <Suspense
              fallback={
                <div className="route-loading">
                  <span className="spinner" />
                  {t(' Открываем страницу…')}
                </div>
              }
            >
              <Routes>
                <Route path="/" element={role === 'admin' ? <Sales /> : <StaffSales />} />
                <Route path="/inventory" element={role === 'admin' ? <Inventory /> : <StaffInventory />} />
                <Route path="/cocktails" element={role === 'admin' ? <Cocktails /> : <StaffRecipes />} />
                <Route
                  path="/reports"
                  element={role === 'admin' ? <Reports /> : <Navigate to="/" replace />}
                />
                <Route path="/files" element={role === 'admin' ? <Backups /> : <Navigate to="/" replace />} />
                <Route
                  path="/operations"
                  element={role === 'admin' ? <Operations /> : <Navigate to="/" replace />}
                />
                <Route path="/audit" element={role === 'admin' ? <Audit /> : <Navigate to="/" replace />} />
                <Route path="/users" element={role === 'admin' ? <Users /> : <Navigate to="/" replace />} />
                <Route path="/barbar/*" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          )}
          <footer className="page-footer">
            <span>
              BARBAR CAFE <i>✳</i> ART GALLERY
            </span>
            <span>{t('Хороший вкус. Точный учёт.')}</span>
          </footer>
        </main>
      </div>
      {hasData && <StockNotifications key={`${user?.id || role}`} />}
      {busy && <LoadingStatus label={activity || 'Сохраняем…'} className="action-progress" />}
      {t(
        notice && (
          <div role={notice.error ? 'alert' : 'status'} className={`toast ${notice.error ? 'error' : ''}`}>
            {t(notice.error ? <Cloud size={19} /> : <CheckCircle2 size={19} />)}
            <span>{t(notice.text)}</span>
          </div>
        ),
      )}
    </div>
  );
}

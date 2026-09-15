import { StockNotifications } from '../features/notifications/StockNotifications';
import { useRouteScroll } from './use-route-scroll';
import { useSessionFilter } from '../presentation/use-session-filter';
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
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
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
import { useCompact } from '../ui/use-compact';
import { Sheet } from '../ui/sheet';
import { SelectSheet } from '../ui/select-sheet';
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
// Phones keep the daily sections under the thumb; the drawer holds everything else.
const bottomNavigation = [
  { path: '/', label: 'Продажи', icon: ShoppingBag },
  { path: '/inventory', label: 'Склад', icon: Boxes },
  { path: '/cocktails', label: 'Меню', icon: GlassWater },
];
export default function App() {
  const { mode, user, role } = useBar();
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
  return <Workspace key={`${user?.id || 'session'}:${role}`} />;
}

function Workspace() {
  const { mode, role, user, notice, logout, refresh, connected, busy, activity, syncing, hasData } = useBar();
  const { pathname } = useLocation();
  useRouteScroll(pathname);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const compact = useCompact();
  const [collapsed, setCollapsed] = useSessionFilter<boolean>(
    'sidebar-collapsed',
    false,
    undefined,
    'workspace',
  );
  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#content">
        {t('Перейти к содержимому')}
      </a>
      {t(
        menu && (
          <button className="sidebar-scrim" aria-label={t('Закрыть меню')} onClick={() => setMenu(false)} />
        ),
      )}
      <aside id="workspace-sidebar" className={`sidebar ${menu ? 'open' : ''}`} inert={busy}>
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
                  title={t(label)}
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
              type="button"
              className="sidebar-toggle icon-button"
              aria-label={t(collapsed ? 'Развернуть меню' : 'Свернуть меню')}
              title={t(collapsed ? 'Развернуть меню' : 'Свернуть меню')}
              aria-expanded={!collapsed}
              aria-controls="workspace-sidebar"
              disabled={busy}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={20} aria-hidden="true" />
              )}
            </button>
            {!compact && (
              <button
                className="mobile-menu icon-button"
                aria-label={t('Открыть меню')}
                onClick={() => setMenu(true)}
              >
                <Menu size={22} />
              </button>
            )}
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
            {compact ? (
              <button
                type="button"
                className="icon-button"
                aria-label={t('Настройки')}
                aria-haspopup="dialog"
                onClick={() => setSettings(true)}
              >
                <Settings size={18} />
              </button>
            ) : (
              <span className="currency-tag">
                <PreferenceControls />
              </span>
            )}
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
      {compact && (
        <nav className="bottom-nav" aria-label={t('Быстрая навигация')} inert={busy}>
          {bottomNavigation.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{t(label)}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={bottomNavigation.some((item) => item.path === pathname) ? '' : 'active'}
            aria-label={t('Открыть меню')}
            aria-controls="workspace-sidebar"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <MoreHorizontal size={21} aria-hidden="true" />
            <span>{t('Ещё')}</span>
          </button>
        </nav>
      )}
      {settings && (
        <Sheet
          title="Настройки"
          subtitle={`${user?.fullName || 'Barbar Cafe'} · ${role === 'admin' ? 'Владелец' : 'Работник'}`}
          close={() => setSettings(false)}
        >
          <div className="settings-sheet">
            <PreferenceControls />
            <span className={`sync-status ${connected ? '' : 'offline'}`}>
              <Cloud size={16} />
              <span>{t(syncing ? 'Обновляем…' : connected ? 'Общие данные' : 'Нет связи')}</span>
            </span>
            <button
              type="button"
              className="button secondary full"
              disabled={busy}
              onClick={() => {
                setSettings(false);
                void logout();
              }}
            >
              <LogOut size={17} />
              {t('Выйти')}
            </button>
          </div>
        </Sheet>
      )}
      {compact && <SelectSheet />}
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

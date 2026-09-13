import { lazy, Suspense, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  ArrowRight,
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
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { Brand, Field, Submit } from './components';
import { useBar } from './store';
const StaffSales = lazy(() => import('./pages/StaffSales'));
const Sales = lazy(() => import('./pages/Sales'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Cocktails = lazy(() => import('./pages/Cocktails'));
const Reports = lazy(() => import('./pages/Reports'));
const Backups = lazy(() => import('./pages/Backups'));
const navigation = [
  { path: '/', label: 'Продажи', icon: ShoppingBag, caption: 'Каждый день' },
  { path: '/inventory', label: 'Склад', icon: Boxes, caption: 'Напитки и закупки' },
  { path: '/cocktails', label: 'Меню и рецепты', icon: GlassWater, caption: 'Коктейли, настойки и всё меню' },
  { path: '/reports', label: 'Отчёты', icon: BarChart3, caption: 'Всё в цифрах' },
  { path: '/files', label: 'Данные и копии', icon: Files, caption: 'Ваши данные' },
];
function Login() {
  const { login, notice } = useBar();
  const [username, setUsername] = useState('barbar');
  const [password, setPassword] = useState('');
  return (
    <main className="login-page">
      <section className="login-form-side">
        <Brand />
        <div className="login-form-wrap">
          <span className="eyebrow">BAR · ART · GOOD COMPANY</span>
          <h1>
            Заходите.
            <br />
            Вы у себя.
          </h1>
          <p className="login-description">
            Любимые напитки, точные рецепты
            <br />и ваш бар под контролем.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login(username, password);
            }}
          >
            <Field label="Логин">
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Пароль вашего бара">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                placeholder="Введите пароль"
                maxLength={1024}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {notice && (
              <div className="login-notice" role="alert">
                {notice.text}
              </div>
            )}
            <Submit>
              Войти в Barbar <ArrowRight size={17} />
            </Submit>
          </form>
        </div>
        <div className="login-footer">
          <ShieldCheck size={16} /> Одно пространство для всей команды <span>AMD ֏</span>
        </div>
      </section>
      <section className="login-visual">
        <div className="login-art-orbit" />
        <div className="login-visual-top">
          <span>BARBAR CAFE</span>
          <span>ART OF THE EVERYDAY ↗</span>
        </div>
        <div className="login-visual-copy">
          <span className="eyebrow">A LITTLE ART. A LITTLE SPIRIT.</span>
          <h2>
            Искусство
            <br />
            быть <em>в моменте.</em>
          </h2>
          <p>
            Место для хороших вкусов
            <br />и красивых вечеров.
          </p>
        </div>
        <div className="login-visual-bottom">
          <span>COCKTAILS & GOOD COMPANY</span>
          <span>EST. WITH LOVE ✳</span>
        </div>
      </section>
    </main>
  );
}
export default function App() {
  const { mode, role, notice, logout, refresh, connected, busy } = useBar();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  if (mode === 'loading') {
    return (
      <div className="app-loading">
        <Brand />
        <span className="spinner" />
        <p>Открываем ваш бар…</p>
      </div>
    );
  }
  if (mode === 'login') {
    return <Login />;
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Перейти к содержимому
      </a>
      {menu && <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="mobile-close icon-button"
            aria-label="Закрыть меню"
            onClick={() => setMenu(false)}
          >
            <X size={21} />
          </button>
        </div>
        <div className="workspace-label">
          <span /> УПРАВЛЕНИЕ БАРОМ
        </div>
        <nav aria-label="Основная навигация">
          {navigation
            .filter((item) => role === 'admin' || item.path === '/')
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
                  {label}
                  <small>{caption}</small>
                </span>
                <ChevronRight size={14} className="nav-arrow" />
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={21} />
            <h3>
              Меньше рутины.
              <br />
              Больше хороших вечеров.
            </h3>
            <p>
              Все цифры здесь.
              <br />
              Вы — ближе к гостям.
            </p>
            <span>THAT'S THE SPIRIT ↗</span>
          </div>
          <div className="sidebar-footer">
            <span className="avatar">B</span>
            <div>
              <strong>Barbar Cafe</strong>
              <small>{role === 'admin' ? 'Администратор' : 'Продажи · barbar'}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Выйти"
              disabled={busy}
              onClick={() => {
                void logout();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Открыть меню"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span>Рабочее пространство</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.path === pathname)?.label || 'Barbar'}</strong>
          </div>
          <div className="topbar-right">
            <span className={`sync-status ${connected ? '' : 'offline'}`}>
              <Cloud size={16} />
              <span>{connected ? 'Общие данные' : 'Нет связи'}</span>
            </span>
            {mode === 'cloud' && (
              <button
                className="icon-button"
                aria-label="Обновить данные"
                disabled={busy}
                onClick={() => {
                  void refresh();
                }}
              >
                <RefreshCw size={16} />
              </button>
            )}
            {role === 'admin' && (
              <span className="currency-tag">
                AMD <b>֏</b>
              </span>
            )}
          </div>
        </header>
        <main id="content" className="page-content">
          <Suspense
            fallback={
              <div className="route-loading">
                <span className="spinner" /> Открываем страницу…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={role === 'admin' ? <Sales /> : <StaffSales />} />
              <Route
                path="/inventory"
                element={role === 'admin' ? <Inventory /> : <Navigate to="/" replace />}
              />
              <Route
                path="/cocktails"
                element={role === 'admin' ? <Cocktails /> : <Navigate to="/" replace />}
              />
              <Route path="/reports" element={role === 'admin' ? <Reports /> : <Navigate to="/" replace />} />
              <Route path="/files" element={role === 'admin' ? <Backups /> : <Navigate to="/" replace />} />
              <Route path="/barbar/*" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <footer className="page-footer">
            <span>
              BARBAR CAFE <i>✳</i> ART GALLERY
            </span>
            <span>Хороший вкус. Точный учёт.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div role={notice.error ? 'alert' : 'status'} className={`toast ${notice.error ? 'error' : ''}`}>
          {notice.error ? <Cloud size={19} /> : <CheckCircle2 size={19} />}
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  );
}

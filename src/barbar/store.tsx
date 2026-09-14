import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initialData, uid } from './domain/model';
import type { Action, BarData, Command, Role, StaffData } from './domain/types';
import type { Preferences } from './preferences';
import { PresentationContext } from './presentation-context';
import { api, ApiError } from './services/api-client';
import type { UserProfile } from './users';

type Mode = 'loading' | 'login' | 'cloud';
type Notice = { text: string; error: boolean } | null;
interface Store {
  user: UserProfile | null;
  updatePreferences: (preferences: Preferences) => Promise<void>;
  data: BarData;
  staffData: StaffData | null;
  role: Role | null;
  mode: Mode;
  busy: boolean;
  notice: Notice;
  connected: boolean;
  run: (action: Action, message?: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
}
const Context = createContext<Store | null>(null);
export function BarProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [data, setData] = useState<BarData>(initialData);
  const [role, setRole] = useState<Role | null>(null);
  const [staffData, setStaffData] = useState<StaffData | null>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const revision = useRef<string | null>(null);
  const sequence = useRef(0);
  const saving = useRef(false);
  const refreshing = useRef(false);
  const latestRole = useRef<Role | null>(null);
  const pending = useRef<{ key: string; command: Command } | null>(null);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  const refresh = useCallback(async () => {
    if (mode !== 'cloud' || saving.current || refreshing.current) {
      return;
    }
    refreshing.current = true;
    const current = ++sequence.current;
    try {
      const result = await api('/api/barbar', {
        headers:
          revision.current && latestRole.current
            ? { 'X-Barbar-Revision': revision.current, 'X-Barbar-Role': latestRole.current }
            : {},
      });
      if (current !== sequence.current) {
        return;
      }
      if (!result.unchanged) {
        setData(result.role === 'admin' ? result.data : initialData());
        setStaffData(result.role === 'barbar' ? result.staffData : null);
        setRole(result.role);
        revision.current = result.revision;
        latestRole.current = result.role;
      }
      setConnected(true);
    } catch (error) {
      if (current !== sequence.current) {
        return;
      }
      setConnected(false);
      if (error instanceof ApiError && error.status === 401) {
        setData(initialData());
        setStaffData(null);
        setUser(null);
        setRole(null);
        setMode('login');
      }
      notify(error instanceof Error ? error.message : 'Не удалось обновить данные.', true);
    } finally {
      refreshing.current = false;
    }
  }, [mode, notify]);
  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const auth = await api('/api/barbar/auth');
        if (active) {
          setUser(auth.user || null);
          setRole(auth.role || null);
          setMode(auth.authenticated ? 'cloud' : 'login');
        }
      } catch (error) {
        if (active) {
          setData(initialData());
          setStaffData(null);
          setUser(null);
          setRole(null);
          setMode('login');
          notify(error instanceof Error ? error.message : 'Не удалось открыть данные.', true);
        }
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [notify]);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, 60000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', focus);
      sequence.current += 1;
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice || notice.error) {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const run = async (action: Action, message = 'Сохранено') => {
    if (saving.current || mode !== 'cloud') {
      return false;
    }
    saving.current = true;
    setBusy(true);
    ++sequence.current;
    const key = JSON.stringify(action);
    if (pending.current?.key !== key) {
      pending.current = { key, command: { ...action, id: uid() } };
    }
    let warning: string | undefined;
    try {
      const result = await api('/api/barbar', {
        method: 'POST',
        body: JSON.stringify({ command: pending.current.command, revision: revision.current }),
      });
      setData(result.role === 'admin' ? result.data : initialData());
      setStaffData(result.role === 'barbar' ? result.staffData : null);
      setRole(result.role);
      revision.current = result.revision;
      latestRole.current = result.role;
      setConnected(true);
      warning = result.warning;
      pending.current = null;
      notify(warning || message, !!warning);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setData(initialData());
        setStaffData(null);
        setUser(null);
        setRole(null);
        setMode('login');
      }
      if (error instanceof ApiError && [400, 403, 413].includes(error.status)) {
        pending.current = null;
      }
      notify(error instanceof Error ? error.message : 'Не удалось сохранить. Повторите попытку.', true);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const login = async (username: string, password: string) => {
    setBusy(true);
    try {
      const auth = await api('/api/barbar/auth', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      ++sequence.current;
      setData(initialData());
      setStaffData(null);
      setUser(auth.user || null);
      setRole(auth.role);
      revision.current = null;
      pending.current = null;
      setNotice(null);
      setMode('cloud');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось войти.', true);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    if (busy) {
      return;
    }
    try {
      if (mode === 'cloud') {
        await api('/api/barbar/auth', { method: 'DELETE' });
      }
      ++sequence.current;
      setData(initialData());
      setStaffData(null);
      setUser(null);
      setRole(null);
      revision.current = null;
      setMode('login');
      setNotice(null);
      pending.current = null;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось выйти.', true);
    }
  };
  const updatePreferences = async (preferences: Preferences) => {
    const result = await api('/api/barbar/auth', { method: 'PATCH', body: JSON.stringify(preferences) });
    setUser(result.user);
  };
  return (
    <Context.Provider
      value={{
        user,
        updatePreferences,
        data,
        staffData,
        role,
        mode,
        busy,
        notice,
        connected,
        run,
        login,
        logout,
        refresh,
        notify,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useBar() {
  useContext(PresentationContext);
  const value = useContext(Context);
  if (!value) {
    throw new Error('BarProvider is missing');
  }
  return value;
}

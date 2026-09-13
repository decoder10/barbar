import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initialData, uid } from './model';
import type { Action, BarData, Command, Role, StaffData } from './types';

type Mode = 'loading' | 'login' | 'cloud';
type Notice = { text: string; error: boolean } | null;
interface Store {
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
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api(path: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      'Нет связи с сервером. Проверьте интернет. Если отправляли продажу, повторите её в этой же форме — она не запишется дважды.',
      0,
    );
  }
  if (response.status === 429) {
    throw new ApiError('Слишком много попыток входа. Попробуйте через минуту.', 429);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(
      'Сервер ещё не подключён. Запустите npm run dev или опубликуйте проект с Functions в Netlify.',
      503,
    );
  }
  const body = await response.json();
  if (!response.ok) {
    throw new ApiError(body.error || 'Не удалось выполнить запрос.', response.status);
  }
  return body;
}
export function BarProvider({ children }: { children: ReactNode }) {
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
  const pending = useRef<{ key: string; command: Command } | null>(null);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  const refresh = useCallback(async () => {
    if (mode !== 'cloud' || saving.current) {
      return;
    }
    const current = ++sequence.current;
    try {
      const result = await api('/api/barbar');
      if (current !== sequence.current) {
        return;
      }
      setData(result.role === 'admin' ? result.data : initialData());
      setStaffData(result.role === 'barbar' ? result.staffData : null);
      setRole(result.role);
      revision.current = result.revision;
      setConnected(true);
    } catch (error) {
      if (current !== sequence.current) {
        return;
      }
      setConnected(false);
      if (error instanceof ApiError && error.status === 401) {
        setData(initialData());
        setStaffData(null);
        setRole(null);
        setMode('login');
      }
      notify(error instanceof Error ? error.message : 'Не удалось обновить данные.', true);
    }
  }, [mode, notify]);
  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const auth = await api('/api/barbar/auth');
        if (active) {
          setRole(auth.role || null);
          setMode(auth.authenticated ? 'cloud' : 'login');
        }
      } catch (error) {
        if (active) {
          setData(initialData());
          setStaffData(null);
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
    }, 30000);
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
      setConnected(true);
      warning = result.warning;
      pending.current = null;
      notify(warning || message, !!warning);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setData(initialData());
        setStaffData(null);
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
      setRole(null);
      revision.current = null;
      setMode('login');
      setNotice(null);
      pending.current = null;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось выйти.', true);
    }
  };
  return (
    <Context.Provider
      value={{ data, staffData, role, mode, busy, notice, connected, run, login, logout, refresh, notify }}
    >
      {children}
    </Context.Provider>
  );
}
export function useBar() {
  const value = useContext(Context);
  if (!value) {
    throw new Error('BarProvider is missing');
  }
  return value;
}

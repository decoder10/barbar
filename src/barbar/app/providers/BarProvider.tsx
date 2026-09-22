import { loadWorking, type WorkingState } from '../../services/working-state';
import { useAsyncTask, type AsyncTaskRunner } from '../../ui/use-async-task';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { initialData, uid } from '../../domain/model';
import type { Action, BarData, Command, Role, StaffData } from '../../domain/types';
import type { Preferences } from '../../domain/identity/preferences';
import { PresentationContext } from '../../presentation/presentation-context';
import { api, ApiError } from '../../services/api-client';
import { clearSessionFilters } from '../../services/session-filters';
import type { UserProfile } from '../../domain/identity/user';

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
  activity: string | null;
  syncing: boolean;
  hasData: boolean;
  perform: AsyncTaskRunner;
  notice: Notice;
  connected: boolean;
  /** Resolves with the id the ledger recorded, so a screen can open what it just created; false on failure. */
  run: (action: Action, message?: string) => Promise<false | { id: string }>;
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
  const { busy, label: activity, execute: perform, active: saving } = useAsyncTask();
  const [syncing, setSyncing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const working = useRef<WorkingState | null>(null);
  const revision = useRef<string | null>(null);
  const sequence = useRef(0);
  const refreshing = useRef(false);
  const pending = useRef<{ key: string; command: Command } | null>(null);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  const refresh = useCallback(async () => {
    if (mode !== 'cloud' || saving.current || refreshing.current) {
      return;
    }
    refreshing.current = true;
    setSyncing(true);
    const current = ++sequence.current;
    try {
      const result = await loadWorking(working.current);
      if (current !== sequence.current) return;
      if (result !== working.current) {
        working.current = result;
        setData(result.data);
        setStaffData(result.staffData);
        setRole(result.role);
        revision.current = result.revision;
      }
      setConnected(true);
      setHasData(true);
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
        working.current = null;
        setMode('login');
      }
      notify(error instanceof Error ? error.message : 'Не удалось обновить данные.', true);
    } finally {
      refreshing.current = false;
      setSyncing(false);
    }
  }, [mode, notify, saving]);
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
          working.current = null;
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
  const run = useCallback(
    async (action: Action, message = 'Сохранено') => {
      if (saving.current || mode !== 'cloud') {
        return false;
      }
      return (
        (await perform(async () => {
          ++sequence.current;
          setNotice(null);
          const key = JSON.stringify(action);
          if (pending.current?.key !== key) {
            pending.current = { key, command: { ...action, id: uid() } };
          }
          const id = pending.current.command.id;
          let warning: string | undefined;
          try {
            const result = await api('/api/barbar', {
              method: 'POST',
              headers: { 'X-Barbar-Protocol': '2' },
              body: JSON.stringify({ command: pending.current.command, revision: revision.current }),
            });
            const next = await loadWorking(working.current, result);
            working.current = next;
            setData(next.data);
            setStaffData(next.staffData);
            setRole(next.role);
            revision.current = next.revision;
            setConnected(true);
            warning = result.warning;
            pending.current = null;
            notify(warning || message, !!warning);
            return { id };
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              setData(initialData());
              setStaffData(null);
              setUser(null);
              setRole(null);
              working.current = null;
              setMode('login');
            }
            if (error instanceof ApiError && [400, 403, 413].includes(error.status)) {
              pending.current = null;
            }
            notify(error instanceof Error ? error.message : 'Не удалось сохранить. Повторите попытку.', true);
            return false;
          }
        }, 'Сохраняем…')) ?? false
      );
    },
    [mode, notify, perform, saving],
  );
  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const auth = await perform(
          () =>
            api('/api/barbar/auth', {
              method: 'POST',
              body: JSON.stringify({ username, password }),
            }),
          'Входим…',
        );
        if (!auth) return;
        clearSessionFilters();
        ++sequence.current;
        setData(initialData());
        setHasData(false);
        setStaffData(null);
        setUser(auth.user || null);
        setRole(auth.role);
        revision.current = null;
        working.current = null;
        pending.current = null;
        setNotice(null);
        setMode('cloud');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Не удалось войти.', true);
      }
    },
    [notify, perform],
  );
  const logout = useCallback(async () => {
    if (saving.current) {
      return;
    }
    try {
      await perform(async () => {
        if (mode === 'cloud') {
          await api('/api/barbar/auth', { method: 'DELETE' });
        }
        clearSessionFilters();
        ++sequence.current;
        setData(initialData());
        setStaffData(null);
        setUser(null);
        setRole(null);
        revision.current = null;
        working.current = null;
        setMode('login');
        setHasData(false);
        setNotice(null);
        pending.current = null;
      }, 'Выходим…');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось выйти.', true);
    }
  }, [mode, notify, perform, saving]);
  const updatePreferences = useCallback(
    async (preferences: Preferences) => {
      const result = await perform(() =>
        api('/api/barbar/auth', { method: 'PATCH', body: JSON.stringify(preferences) }),
      );
      if (result) setUser(result.user);
    },
    [perform],
  );
  // Every screen and every session filter reads this context: a new object each render
  // re-rendered the whole workspace on each poll, so the value is built only when it changes.
  const store = useMemo<Store>(
    () => ({
      user,
      updatePreferences,
      data,
      staffData,
      role,
      mode,
      busy,
      activity,
      syncing,
      hasData,
      perform,
      notice,
      connected,
      run,
      login,
      logout,
      refresh,
      notify,
    }),
    [
      user,
      updatePreferences,
      data,
      staffData,
      role,
      mode,
      busy,
      activity,
      syncing,
      hasData,
      perform,
      notice,
      connected,
      run,
      login,
      logout,
      refresh,
      notify,
    ],
  );
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useBar() {
  useContext(PresentationContext);
  const value = useContext(Context);
  if (!value) {
    throw new Error('BarProvider is missing');
  }
  return value;
}

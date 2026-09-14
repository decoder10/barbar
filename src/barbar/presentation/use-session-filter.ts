import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { useBar } from '../app/providers/BarProvider';
import {
  filterSessionKey,
  readSessionFilter,
  writeSessionFilter,
  type FilterValue,
} from '../services/session-filters';

/** Tab-session presentation state, isolated by user, role and route. */
export function useSessionFilter<T extends FilterValue>(
  name: string,
  initial: T | (() => T),
  validate?: (value: unknown) => value is T,
  scope?: string,
): readonly [T, Dispatch<SetStateAction<T>>] {
  const { user, role } = useBar();
  const { pathname } = useLocation();
  const key = filterSessionKey(user?.id || role || 'guest', role || 'guest', scope ?? pathname, name);
  const fallback = typeof initial === 'function' ? initial() : initial;
  const [state, setState] = useState(() => ({ key, value: readSessionFilter(key, fallback, validate) }));
  const value = state.key === key ? state.value : readSessionFilter(key, fallback, validate);
  useEffect(() => {
    if (state.key === key) writeSessionFilter(key, state.value);
  }, [key, state]);
  const update: Dispatch<SetStateAction<T>> = (next) => {
    setState((previous) => {
      const current = previous.key === key ? previous.value : readSessionFilter(key, fallback, validate);
      return { key, value: typeof next === 'function' ? next(current) : next };
    });
  };
  return [value, update] as const;
}

const prefix = 'barbar-session-filters:v1:';
export type FilterValue = string | number | boolean | null;

export function filterSessionKey(user: string, role: string, page: string, filter: string) {
  return prefix + JSON.stringify([user, role, page, filter]);
}

export function readSessionFilter<T extends FilterValue>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    const valid = validate
      ? validate(value)
      : (fallback === null ? value === null : typeof value === typeof fallback) &&
        (typeof value !== 'number' || Number.isFinite(value)) &&
        (typeof value !== 'string' || value.length <= 2000);
    return valid ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeSessionFilter(key: string, value: FilterValue) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Filters still work when browser storage is unavailable.
  }
}

export function clearSessionFilters() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage restrictions must not prevent signing out.
  }
}

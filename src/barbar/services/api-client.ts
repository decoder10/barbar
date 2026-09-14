import type { BarData, Role, StaffData } from '../domain/types';
import type { UserProfile } from '../domain/identity/user';
interface ApiResponses {
  '/api/barbar/push': { publicKey: string | null; ok?: boolean };
  [path: `/api/barbar/report${string}`]: import('../domain/reports/server-types').ServerReport;
  '/api/barbar?view=full': { data: BarData; revision: string };
  [path: `/api/barbar/history${string}`]: import('../domain/reports/server-types').HistoryPage;
  [path: `/api/barbar/audit${string}`]: {
    events: import('../domain/identity/audit').AuditEvent[];
    nextCursor: string | null;
  };
  '/api/barbar/auth': { authenticated: boolean; user: UserProfile | null; role: Role | null };
  '/api/barbar/users': { users: UserProfile[]; user: UserProfile };
  '/api/barbar': {
    role: Role;
    data: BarData;
    staffData: StaffData;
    revision: string;
    unchanged?: boolean;
    warning?: string;
  };
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request(path: string, options?: RequestInit) {
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

const inflight = new Map<string, Promise<unknown>>();
/** Coalesce simultaneous read requests; never cache identities or deduplicate mutations. */
export function api<P extends keyof ApiResponses>(path: P, options?: RequestInit): Promise<ApiResponses[P]> {
  if (options?.method && options.method !== 'GET') return request(path, options);
  const key = path + JSON.stringify(options?.headers || {});
  const current = inflight.get(key);
  if (current) return current as Promise<ApiResponses[P]>;
  const pending = request(path, options).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

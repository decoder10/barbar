import { initialData } from '../../src/barbar/model';
import type { BarData, Sale } from '../../src/barbar/types';

export interface Storage {
  read: (key: string) => Promise<{ value: unknown; etag: string } | null>;
  write: (
    key: string,
    value: unknown,
    condition: { onlyIfNew: true } | { onlyIfMatch: string },
  ) => Promise<{ modified: boolean; etag?: string }>;
  remove: (key: string) => Promise<void>;
}
interface Manifest {
  version: 1;
  data: Omit<BarData, 'sales'>;
  days: Record<string, string>;
}
export interface Snapshot {
  data: BarData;
  revision: string | null;
  days: Record<string, string>;
}
const INDEX = 'data.json';
export async function readSnapshot(storage: Storage): Promise<Snapshot> {
  for (let retry = 0; retry < 5; retry += 1) {
    const entry = await storage.read(INDEX);
    if (!entry) {
      return { data: initialData(), revision: null, days: {} };
    }
    const manifest = entry.value as Manifest;
    if (manifest.version !== 1 || !manifest.data || !manifest.days) {
      throw new Error('Unsupported storage manifest');
    }
    const keys = Object.values(manifest.days);
    const entries: ({ value: unknown; etag: string } | null)[] = [];
    for (let start = 0; start < keys.length; start += 12) {
      entries.push(...(await Promise.all(keys.slice(start, start + 12).map((key) => storage.read(key)))));
    }
    // A concurrent commit may have replaced and removed an old daily file after
    // we read its manifest. Reload the manifest and retry instead of losing sales.
    if (entries.some((item) => !item)) {
      continue;
    }
    const sales = entries
      .flatMap((item) => item!.value as Sale[])
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return { data: { ...manifest.data, sales }, revision: entry.etag, days: manifest.days };
  }
  throw new Error('Concurrent updates prevented a consistent read');
}
const groupDays = (sales: Sale[]) => {
  const result: Record<string, Sale[]> = {};
  sales.forEach((s) => {
    (result[s.date] ||= []).push(s);
  });
  Object.values(result).forEach((day) => day.sort((a, b) => a.id.localeCompare(b.id)));
  return result;
};
export async function commitSnapshot(storage: Storage, current: Snapshot, next: BarData) {
  const previousDays = groupDays(current.data.sales);
  const nextDays = groupDays(next.sales);
  const days: Record<string, string> = {};
  const created: string[] = [];
  // Daily sales live in their own sales/ folder. Immutable versions are prepared
  // first, and become visible together only after the atomic manifest swap.
  for (const [date, sales] of Object.entries(nextDays)) {
    if (current.days[date] && JSON.stringify(previousDays[date]) === JSON.stringify(sales)) {
      days[date] = current.days[date];
      continue;
    }
    const key = `sales/${date}/${crypto.randomUUID()}.json`;
    const result = await storage.write(key, sales, { onlyIfNew: true });
    if (!result.modified || !result.etag) {
      throw new Error('Daily file was not acknowledged');
    }
    days[date] = key;
    created.push(key);
  }
  const { sales: ignoredSales, ...data } = next;
  void ignoredSales;
  const result = await storage.write(
    INDEX,
    { version: 1, data, days } satisfies Manifest,
    current.revision ? { onlyIfMatch: current.revision } : { onlyIfNew: true },
  );
  if (result.modified && !result.etag) {
    throw new Error('Manifest was not acknowledged');
  }
  if (!result.modified) {
    await Promise.allSettled(created.map((key) => storage.remove(key)));
    return { modified: false as const };
  }
  // Old daily files, including purged dates, are physically removed after commit.
  // A cleanup failure does not undo an acknowledged sale; report it to the caller.
  const oldKeys = Object.entries(current.days)
    .filter(([date, key]) => days[date] !== key)
    .map(([, key]) => key);
  const cleanup = await Promise.allSettled(oldKeys.map((key) => storage.remove(key)));
  return {
    modified: true as const,
    revision: result.etag,
    cleanupPending: cleanup.some((result) => result.status === 'rejected'),
  };
}

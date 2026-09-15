import { MongoClient } from 'mongodb';
import { copyFile, mkdir, readdir, stat, unlink, writeFile, chmod, rename } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backupDatabase, encryptionKey, readBackup, restoreDatabase } from './backup.mjs';
import { storageReport } from './storage-report.mjs';
import presets from '../../src/barbar/config/presets.json' with { type: 'json' };

const archive = /^barbar-(\d{4}-\d{2}-\d{2})T[\d-]+(?:\.\d+)?Z\.barbar-backup$/;

const isoWeek = (date) => {
  const day = new Date(`${date}T00:00:00Z`);
  const shifted = new Date(day.getTime() + (3 - ((day.getUTCDay() + 6) % 7)) * 86400000);
  const firstThursday = new Date(Date.UTC(shifted.getUTCFullYear(), 0, 4));
  return `${shifted.getUTCFullYear()}-${Math.round((shifted - firstThursday) / 604800000) + 1}`;
};

/** Newest copy per day for `daily` days and newest per ISO week for `weekly` weeks. Other names are never touched. */
export function retainedArchives(names, daily = 7, weekly = 4) {
  const archives = names
    .filter((name) => archive.test(name))
    .sort()
    .reverse();
  const keep = new Set();
  const days = new Set();
  const weeks = new Set();
  for (const name of archives) {
    const date = name.match(archive)[1];
    if (!days.has(date) && days.size < daily) keep.add(name);
    days.add(date);
    const week = isoWeek(date);
    if (!weeks.has(week) && weeks.size < weekly) keep.add(name);
    weeks.add(week);
  }
  return { keep, remove: archives.filter((name) => !keep.has(name)) };
}

async function prune(directory, daily, weekly) {
  const { remove } = retainedArchives(await readdir(directory), daily, weekly);
  for (const name of remove) await unlink(resolve(directory, name));
  return remove.length;
}

/**
 * One unattended run: encrypted snapshot, integrity check, restore into a disposable database with
 * count comparison, a verified copy on a separate storage location, then retention. Fails loudly.
 */
export async function runScheduledBackup({
  sourceUri,
  sourceDatabase = 'barbar',
  restoreUri,
  keyPath,
  directory,
  mirrorDirectory,
  daily = 7,
  weekly = 4,
  allowSameDevice = false,
  storageLimitMb = presets.storage.limitMb,
  now = new Date(),
}) {
  if (!sourceUri || !restoreUri || !keyPath || !directory) throw new Error('Backup settings are incomplete.');
  if (!mirrorDirectory) throw new Error('Set BARBAR_BACKUP_MIRROR_DIR to a separate disk or synced folder.');
  if (sourceUri === restoreUri) throw new Error('Restore check must use a separate database server.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await mkdir(mirrorDirectory, { recursive: true, mode: 0o700 });
  if (!allowSameDevice && (await stat(directory)).dev === (await stat(mirrorDirectory)).dev)
    throw new Error('The mirror directory is on the same disk as the backups.');
  const key = await encryptionKey(resolve(keyPath), true);
  const name = `barbar-${now.toISOString().replaceAll(':', '-')}.barbar-backup`;
  const path = resolve(directory, name);
  const source = new MongoClient(sourceUri, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  const restore = new MongoClient(restoreUri, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  const target = `barbar_restore_check_${now.toISOString().replace(/\D/g, '').slice(0, 14)}`;
  let created = false;
  try {
    const backup = await backupDatabase(source.db(sourceDatabase), key, path);
    const verified = await readBackup(path, key);
    created = true;
    const restored = await restoreDatabase(restore, target, path, key);
    if (restored.documents !== verified.documents) throw new Error('Restore check document count differs.');
    const mirrorPath = resolve(mirrorDirectory, name);
    const partial = `${mirrorPath}.partial`;
    await copyFile(path, partial);
    await chmod(partial, 0o600);
    const mirrored = await readBackup(partial, key);
    if (mirrored.documents !== verified.documents) throw new Error('Mirror copy differs from the backup.');
    await rename(partial, mirrorPath);
    const removed = (await prune(directory, daily, weekly)) + (await prune(mirrorDirectory, daily, weekly));
    // Storage fill level of the free cluster; a failed measurement never fails the backup.
    const storage = await storageReport(source.db(sourceDatabase), { limitMb: storageLimitMb })
      .then((r) => ({
        usedPercent: r.usedPercent,
        dataMb: r.dataMb,
        indexMb: r.indexMb,
        estimatedMonthsLeft: r.estimatedMonthsLeft,
        storageWarning: r.usedPercent >= presets.storage.warningPercent,
      }))
      .catch(() => ({ unavailable: true }));
    return {
      ok: true,
      at: now.toISOString(),
      archive: basename(path),
      bytes: backup.bytes,
      documents: verified.documents,
      restoreCheck: 'passed',
      mirror: 'verified',
      pruned: removed,
      storage,
    };
  } finally {
    if (created)
      await restore
        .db(target)
        .dropDatabase()
        .catch(() => {});
    await Promise.allSettled([source.close(), restore.close()]);
  }
}

async function main() {
  if (process.env.BARBAR_BACKUP_ENV_FILE) process.loadEnvFile(process.env.BARBAR_BACKUP_ENV_FILE);
  const directory = resolve(process.env.BARBAR_BACKUP_DIR || '.barbar-backups');
  const status = resolve(directory, 'last-run.json');
  try {
    const result = await runScheduledBackup({
      sourceUri: process.env.BARBAR_BACKUP_MONGODB_URI,
      sourceDatabase: process.env.BARBAR_BACKUP_DATABASE || 'barbar',
      restoreUri: process.env.BARBAR_RESTORE_MONGODB_URI,
      keyPath: process.env.BARBAR_BACKUP_KEY_FILE,
      directory,
      mirrorDirectory: process.env.BARBAR_BACKUP_MIRROR_DIR && resolve(process.env.BARBAR_BACKUP_MIRROR_DIR),
      daily: Number(process.env.BARBAR_BACKUP_KEEP_DAILY || 7),
      weekly: Number(process.env.BARBAR_BACKUP_KEEP_WEEKLY || 4),
    });
    await writeFile(status, JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Messages only: connection strings and documents are never printed.
    const failure = { ok: false, at: new Date().toISOString(), error: error?.message || 'Backup failed' };
    await mkdir(directory, { recursive: true, mode: 0o700 }).catch(() => {});
    await writeFile(status, JSON.stringify(failure, null, 2), { mode: 0o600 }).catch(() => {});
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

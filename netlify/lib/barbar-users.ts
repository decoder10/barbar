import { oncePerDatabase } from './database/migrations';
import { ensureAuditIndexes } from './database/indexes';
import type { Db } from 'mongodb';
import { actorProfile, appendAudit } from './audit/store';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { defaultPreferences, type Preferences } from '../../src/barbar/domain/identity/preferences';
import type { UserInput, UserProfile } from '../../src/barbar/domain/identity/user';

const derive = (
  password: string,
  salt: string,
  length: number,
  options: { N?: number; r?: number; p?: number; maxmem?: number } = {},
) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
const passwordWork = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }; // OWASP scrypt profile, ~32 MiB per login.
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface IdentityStore {
  login(username: unknown, password: unknown): Promise<{ user: UserProfile; token: string } | null>;
  resolve(token: string): Promise<UserProfile | null>;
  revoke(token: string): Promise<void>;
  list(): Promise<UserProfile[]>;
  create(input: unknown, actor?: UserProfile): Promise<UserProfile>;
  update?: (id: string, input: unknown, actor: UserProfile) => Promise<UserProfile>;
  setPreferences?: (id: string, input: unknown) => Promise<UserProfile>;
}
type UserRecord = UserProfile & { _id: string; passwordHash: string; authVersion?: number };
type SessionRecord = { _id: string; userId: string; expiresAt: Date; authVersion?: number };
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64, passwordWork)) as Buffer;
  return `scrypt-v2:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split(':');
  if (
    !['scrypt', 'scrypt-v2'].includes(algorithm) ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(expected)
  )
    return false;
  return timingSafeEqual(
    (await derive(password, salt, 64, algorithm === 'scrypt-v2' ? passwordWork : {})) as Buffer,
    Buffer.from(expected, 'hex'),
  );
}
export function validateUser(input: unknown): UserInput {
  if (!input || typeof input !== 'object') throw new UserError('Заполните данные пользователя.');
  const value = input as Record<string, unknown>;
  const string = (key: string, max: number) => {
    if (value[key] !== undefined && typeof value[key] !== 'string')
      throw new UserError('Некорректные данные пользователя.');
    const result = ((value[key] || '') as string).trim();
    if (result.length > max) throw new UserError('Слишком длинное значение поля.');
    return result;
  };
  const username = string('username', 64).toLowerCase();
  const fullName = string('fullName', 120);
  const email = string('email', 254);
  const phone = string('phone', 40);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username))
    throw new UserError('Логин: от 3 до 64 латинских букв, цифр, точек, дефисов или _.');
  if (!fullName) throw new UserError('Укажите имя пользователя.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Проверьте email.');
  if (value.role !== 'owner' && value.role !== 'worker')
    throw new UserError('Выберите роль: владелец или работник.');
  if (typeof value.password !== 'string' || value.password.length < 12 || value.password.length > 128)
    throw new UserError('Пароль должен содержать от 12 до 128 символов.');
  return { username, fullName, email, phone, role: value.role, password: value.password };
}
export function publicUser(user: UserRecord): UserProfile {
  return {
    preferences: { ...defaultPreferences, ...user.preferences },
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  };
}
export function mongoUsers(db: Db): IdentityStore {
  const users = db.collection<UserRecord>('users');
  const sessions = db.collection<SessionRecord>('sessions');
  let ready: Promise<void> | undefined;
  async function initialize() {
    await users.createIndex({ username: 1 }, { unique: true });
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await sessions.createIndex({ userId: 1 });
    await ensureAuditIndexes(db);
    // Insert-only migration. Existing database credentials and roles always remain authoritative.
    const accounts = [
      {
        id: 'initial-owner',
        username: process.env.BARBAR_ADMIN_USERNAME || 'admin',
        password: process.env.BARBAR_ADMIN_PASSWORD,
        fullName: 'Грач',
        role: 'owner' as const,
      },
      {
        id: 'initial-worker',
        username: process.env.BARBAR_USERNAME || 'barbar',
        password: process.env.BARBAR_PASSWORD,
        fullName: 'Ника',
        role: 'worker' as const,
      },
    ];
    if (accounts[0].username.toLowerCase() === accounts[1].username.toLowerCase())
      throw new Error('Ambiguous bootstrap users');
    for (const account of accounts) {
      if (await users.findOne({ _id: account.id })) {
        await users.updateOne(
          { _id: account.id, fullName: { $in: ['Владелец', 'Barbar'] } },
          { $set: { fullName: account.fullName } },
        );
        continue;
      }
      if (!account.password || account.password.length < 12) continue;
      const value = validateUser(account);
      const { password, ...profile } = value;
      const record: UserRecord = {
        ...profile,
        id: account.id,
        _id: account.id,
        active: true,
        createdAt: new Date().toISOString(),
        passwordHash: await hashPassword(password),
      };
      try {
        await users.updateOne({ _id: account.id }, { $setOnInsert: record }, { upsert: true });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000 || !(await users.findOne({ _id: account.id })))
          throw error;
      }
    }
    if (!(await users.findOne({ role: 'owner', active: true })))
      throw new Error('Configure initial owner credentials');
  }
  async function ensureReady() {
    ready ||= oncePerDatabase(db, 'identity-bootstrap-v2', initialize).catch((error) => {
      ready = undefined;
      throw error;
    });
    await ready;
  }
  return {
    async update(id, input, actor) {
      if (!id || typeof input !== 'object' || !input) throw new UserError('Некорректный пользователь.');
      const value = input as Record<string, unknown>;
      const profile = validateUser({
        ...value,
        password:
          value.password === undefined || value.password === '' ? 'validation-only-unused' : value.password,
      });
      if (typeof value.active !== 'boolean') throw new UserError('Укажите статус доступа.');
      const active = value.active;
      if (id === actor.id && (!value.active || profile.role !== 'owner'))
        throw new UserError('Нельзя отключить свой аккаунт или снять с себя роль владельца.');
      const passwordHash = value.password ? await hashPassword(profile.password) : undefined;
      await ensureReady();
      try {
        return await db.client.withSession(async (session) =>
          session.withTransaction(async () => {
            // Serialize owner changes, including concurrent demotions of different owners.
            await db
              .collection<{ _id: string; version: number }>('identityState')
              .updateOne({ _id: 'owners' }, { $inc: { version: 1 } }, { upsert: true, session });
            const currentActor = await users.findOne(
              { _id: actor.id, active: true, role: 'owner' },
              { session },
            );
            if (!currentActor) throw new UserError('Доступ владельца отозван.', 403);
            const current = await users.findOne({ _id: id }, { session });
            if (!current) throw new UserError('Пользователь не найден.', 404);
            if (
              current.role === 'owner' &&
              current.active &&
              (!value.active || profile.role !== 'owner') &&
              (await users.countDocuments({ role: 'owner', active: true }, { session })) <= 1
            )
              throw new UserError('В баре должен оставаться активный владелец.');
            const { password: ignored, ...fields } = profile;
            void ignored;
            const changedAccess =
              !!passwordHash || current.role !== profile.role || current.active !== value.active;
            const result = await users.findOneAndUpdate(
              { _id: id },
              {
                $set: { ...fields, active, ...(passwordHash ? { passwordHash } : {}) },
                ...(changedAccess ? { $inc: { authVersion: 1 } } : {}),
              },
              { session, returnDocument: 'after' },
            );
            if (changedAccess) await sessions.deleteMany({ userId: id }, { session });
            await appendAudit(db, session, {
              id: randomUUID(),
              createdAt: new Date().toISOString(),
              actor: actorProfile(currentActor),
              action: passwordHash
                ? 'user.password'
                : current.active !== value.active
                  ? 'user.access'
                  : 'user.update',
              targetId: id,
              summary: `${fields.fullName}: ${fields.role}; ${value.active ? 'доступ открыт' : 'доступ закрыт'}${passwordHash ? '; пароль изменён' : ''}`,
            });
            return publicUser(result!);
          }),
        );
      } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new UserError('Этот логин уже занят.', 409);
        throw error;
      }
    },
    async setPreferences(id, input) {
      const value = input as Preferences;
      if (
        !value ||
        !['ru', 'hy', 'en'].includes(value.language) ||
        !['AMD', 'RUB', 'USD', 'EUR'].includes(value.currency) ||
        (value.theme !== undefined && !['light', 'dark'].includes(value.theme))
      )
        throw new UserError('Некорректные настройки.');
      await ensureReady();
      const user = await users.findOneAndUpdate(
        { _id: id, active: true },
        {
          $set: {
            preferences: {
              language: value.language,
              currency: value.currency,
              ...(value.theme ? { theme: value.theme } : {}),
            },
          },
        },
        { returnDocument: 'after' },
      );
      if (!user) throw new UserError('Пользователь не найден.', 404);
      return publicUser(user);
    },
    async login(username, password) {
      await ensureReady();
      if (
        typeof username !== 'string' ||
        username.length > 64 ||
        typeof password !== 'string' ||
        password.length > 128
      )
        return null;
      const user = await users.findOne({ username: username.trim().toLowerCase(), active: true });
      // Run the same KDF for unknown usernames to avoid a fast username probe.
      const fallback = `scrypt-v2:${'0'.repeat(32)}:${'0'.repeat(128)}`;
      const valid = await verifyPassword(password, user?.passwordHash || fallback);
      if (!user || !valid) return null;
      if (user.passwordHash.startsWith('scrypt:')) {
        await users.updateOne(
          { _id: user._id, passwordHash: user.passwordHash },
          { $set: { passwordHash: await hashPassword(password) } },
        );
      }
      const token = randomBytes(32).toString('hex');
      await sessions.insertOne({
        _id: digest(token),
        userId: user.id,
        authVersion: user.authVersion || 0,
        expiresAt: new Date(Date.now() + 43200000),
      });
      return { user: publicUser(user), token };
    },
    async resolve(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      await ensureReady();
      // Both lookups use _id indexes. Resolve live access in one database round trip;
      // never cache authorization across blocking, password resets or role changes.
      const result = await sessions
        .aggregate<{ user: UserRecord }>([
          { $match: { _id: digest(token), expiresAt: { $gt: new Date() } } },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          {
            $match: {
              'user.active': true,
              $expr: {
                $eq: [{ $ifNull: ['$authVersion', 0] }, { $ifNull: ['$user.authVersion', 0] }],
              },
            },
          },
          { $project: { _id: 0, user: 1 } },
        ])
        .next();
      return result ? publicUser(result.user) : null;
    },
    async revoke(token) {
      if (/^[a-f0-9]{64}$/.test(token)) await sessions.deleteOne({ _id: digest(token) });
    },
    async list() {
      await ensureReady();
      return (await users.find().sort({ createdAt: 1, username: 1 }).toArray()).map(publicUser);
    },
    async create(input, actor) {
      const value = validateUser(input);
      await ensureReady();
      const { password, ...profile } = value;
      const id = randomUUID();
      const record: UserRecord = {
        ...profile,
        id,
        _id: id,
        active: true,
        createdAt: new Date().toISOString(),
        passwordHash: await hashPassword(password),
      };
      try {
        await db.client.withSession(async (session) =>
          session.withTransaction(async () => {
            if (actor) {
              await db
                .collection<{ _id: string; version: number }>('identityState')
                .updateOne({ _id: 'owners' }, { $inc: { version: 1 } }, { upsert: true, session });
              if (!(await users.findOne({ _id: actor.id, active: true, role: 'owner' }, { session })))
                throw new UserError('Доступ владельца отозван.', 403);
            }
            await users.insertOne(record, { session });
            if (actor)
              await appendAudit(db, session, {
                id: randomUUID(),
                createdAt: new Date().toISOString(),
                actor: actorProfile(actor),
                action: 'user.create',
                targetId: id,
                summary: `Создан пользователь ${profile.fullName} (${profile.role})`,
              });
          }),
        );
      } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new UserError('Этот логин уже занят.', 409);
        throw error;
      }
      return publicUser(record);
    },
  };
}

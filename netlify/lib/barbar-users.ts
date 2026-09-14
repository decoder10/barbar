import type { Db } from 'mongodb';
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
  create(input: unknown): Promise<UserProfile>;
  setPreferences?: (id: string, input: unknown) => Promise<UserProfile>;
}
type UserRecord = UserProfile & { _id: string; passwordHash: string };
type SessionRecord = { _id: string; userId: string; expiresAt: Date };
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
    ready ||= initialize().catch((error) => {
      ready = undefined;
      throw error;
    });
    await ready;
  }
  return {
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
        expiresAt: new Date(Date.now() + 43200000),
      });
      return { user: publicUser(user), token };
    },
    async resolve(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      await ensureReady();
      const session = await sessions.findOne({ _id: digest(token), expiresAt: { $gt: new Date() } });
      if (!session) return null;
      const user = await users.findOne({ _id: session.userId, active: true });
      return user ? publicUser(user) : null;
    },
    async revoke(token) {
      if (/^[a-f0-9]{64}$/.test(token)) await sessions.deleteOne({ _id: digest(token) });
    },
    async list() {
      await ensureReady();
      return (await users.find().sort({ createdAt: 1, username: 1 }).toArray()).map(publicUser);
    },
    async create(input) {
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
        await users.insertOne(record);
      } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new UserError('Этот логин уже занят.', 409);
        throw error;
      }
      return publicUser(record);
    },
  };
}

import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionCookie } from './barbar-auth';
import { handleAuth, handleUsers } from './barbar-user-handler';
import { hashPassword, mongoUsers, validateUser, verifyPassword } from './barbar-users';

it('salts passwords and validates roles and profile fields', async () => {
  const a = await hashPassword('test-password-123');
  expect(a).not.toBe(await hashPassword('test-password-123'));
  expect(await verifyPassword('test-password-123', a)).toBe(true);
  expect(await verifyPassword('wrong', a)).toBe(false);
  expect(() =>
    validateUser({ username: 'aram', fullName: 'Арам', password: 'long-password-123', role: 'admin' }),
  ).toThrow();
});
const uri = process.env.BARBAR_TEST_MONGODB_URI;
describe.skipIf(!uri)('database users and sessions', () => {
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017');
  const db = client.db(`barbar_identity_test_${crypto.randomUUID().replaceAll('-', '')}`);
  const users = mongoUsers(db);
  const origin = 'https://barbar.example';
  const request = (path: string, token = '', value?: unknown) =>
    new Request(origin + path, {
      method: value ? 'POST' : 'GET',
      headers: { origin, cookie: sessionCookie(new Request(origin), token) },
      ...(value ? { body: JSON.stringify(value) } : {}),
    });
  beforeAll(async () => {
    await db.collection('users').insertOne({
      _id: 'test-owner' as never,
      id: 'test-owner',
      username: 'test-owner',
      fullName: 'Test Owner',
      email: '',
      phone: '',
      role: 'owner',
      active: true,
      createdAt: '',
      passwordHash: await hashPassword('owner-password-123'),
    });
  });
  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });
  it('persists owner-created profiles and hashes, supports both roles and rejects privilege forgery', async () => {
    const owner = (await users.login('test-owner', 'owner-password-123'))!;
    for (const role of ['worker', 'owner']) {
      const profile = {
        username: `new-${role}`,
        password: 'new-password-123',
        fullName: 'Имя Фамилия',
        email: 'name@example.com',
        phone: '+374 123456',
        role,
        passwordHash: 'forged',
        active: false,
      };
      const response = await handleUsers(request('/api/barbar/users', owner.token, profile), users);
      expect(response.status).toBe(201);
      const created = (await response.json()).user;
      expect(created).toMatchObject({ username: `new-${role}`, fullName: 'Имя Фамилия', role, active: true });
      expect(JSON.stringify(created)).not.toMatch(/password|hash/i);
      const saved = await db.collection('users').findOne({ username: `new-${role}` });
      expect(saved?.password).toBeUndefined();
      expect(saved?.passwordHash).not.toContain('new-password-123');
      const restarted = mongoUsers(db);
      const session = (await restarted.login(`NEW-${role}`, 'new-password-123'))!;
      expect((await restarted.resolve(session.token))?.role).toBe(role);
      if (role === 'worker') {
        expect((await handleUsers(request('/api/barbar/users', session.token), users)).status).toBe(403);
        expect(
          (
            await handleUsers(
              request('/api/barbar/users', session.token, { ...profile, role: 'owner' }),
              users,
            )
          ).status,
        ).toBe(403);
        const login = await handleAuth(
          request('/api/barbar/auth', '', {
            username: 'new-worker',
            password: 'new-password-123',
            role: 'owner',
          }),
          users,
        );
        expect(await login.json()).toMatchObject({ role: 'barbar', user: { role: 'worker' } });
      }
      expect((await handleUsers(request('/api/barbar/users', owner.token, profile), users)).status).toBe(409);
    }
    const list = await handleUsers(request('/api/barbar/users', owner.token), users);
    expect(list.status).toBe(200);
    expect(JSON.stringify(await list.json())).not.toMatch(/password|hash/i);
    const cross = request('/api/barbar/users', owner.token, { role: 'owner' });
    cross.headers.set('origin', 'https://evil.example');
    expect((await handleUsers(cross, users)).status).toBe(403);
    expect((await handleUsers(request('/api/barbar/users'), users)).status).toBe(401);
  });
  it('persists preferences only for the authenticated user and ignores forged role and id', async () => {
    const profile = await users.create({
      username: 'prefs-worker',
      fullName: 'Ника',
      role: 'worker',
      password: 'prefs-password-123',
    });
    const session = (await users.login('prefs-worker', 'prefs-password-123'))!;
    const patch = (value: unknown, token = session.token) =>
      new Request(origin + '/api/barbar/auth', {
        method: 'PATCH',
        headers: { origin, cookie: sessionCookie(new Request(origin), token) },
        body: JSON.stringify(value),
      });
    const response = await handleAuth(
      patch({ language: 'hy', currency: 'USD', theme: 'dark', role: 'owner', id: 'test-owner' }),
      users,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).user).toMatchObject({
      id: profile.id,
      role: 'worker',
      preferences: { language: 'hy', currency: 'USD', theme: 'dark' },
    });
    expect((await mongoUsers(db).resolve(session.token))?.preferences).toEqual({
      language: 'hy',
      currency: 'USD',
      theme: 'dark',
    });
    expect((await db.collection('users').findOne({ username: 'test-owner' }))?.preferences).toBeUndefined();
    expect((await handleAuth(patch({ language: 'xx', currency: 'USD' }), users)).status).toBe(400);
    expect(
      (await handleAuth(patch({ language: 'ru', currency: 'AMD', theme: 'invalid' }), users)).status,
    ).toBe(400);
    expect((await handleAuth(patch({ language: 'ru', currency: 'AMD' }, ''), users)).status).toBe(401);
  });
  it('rejects tampered and expired sessions, reads current roles and revokes logout tokens', async () => {
    const session = (await users.login('test-owner', 'owner-password-123'))!;
    expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    expect(await users.resolve('admin.9999999999999.fake')).toBeNull();
    expect(await users.resolve(session.token.slice(1))).toBeNull();
    await db.collection('users').updateOne({ username: 'test-owner' }, { $set: { role: 'worker' } });
    expect((await users.resolve(session.token))?.role).toBe('worker');
    await db.collection('users').updateOne({ username: 'test-owner' }, { $set: { role: 'owner' } });
    await users.revoke(session.token);
    expect(await users.resolve(session.token)).toBeNull();
    const second = (await users.login('test-owner', 'owner-password-123'))!;
    await db.collection('sessions').updateMany({}, { $set: { expiresAt: new Date(0) } });
    expect(await users.resolve(second.token)).toBeNull();
    const third = (await users.login('test-owner', 'owner-password-123'))!;
    await db.collection('users').updateOne({ username: 'test-owner' }, { $set: { active: false } });
    expect(await users.resolve(third.token)).toBeNull();
    expect(await users.login('test-owner', 'owner-password-123')).toBeNull();
  });
});

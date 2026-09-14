import { createHash } from 'node:crypto';
import { handleAudit } from './audit/handler';
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
  it('edits profiles, blocks access, resets passwords and invalidates concurrent stale sessions', async () => {
    const owner = (await users.login('test-owner', 'owner-password-123'))!;
    const worker = await users.create({
      username: 'edit-worker',
      fullName: 'Before',
      role: 'worker',
      password: 'old-password-123',
    });
    const login = (await users.login('edit-worker', 'old-password-123'))!;
    const patch = (input: unknown, token = owner.token) =>
      new Request(origin + '/api/barbar/users', {
        method: 'PATCH',
        headers: { origin, cookie: sessionCookie(new Request(origin), token) },
        body: JSON.stringify(input),
      });
    const input = { ...worker, fullName: 'After', password: 'new-password-123' };
    expect((await handleUsers(patch(input, login.token), users)).status).toBe(403);
    expect((await handleUsers(patch(input), users)).status).toBe(200);
    expect(await users.resolve(login.token)).toBeNull();
    // A login begun before the reset may insert its old-version session after deletion.
    await db.collection('sessions').insertOne({
      _id: createHash('sha256').update(login.token).digest('hex') as never,
      userId: worker.id,
      authVersion: 0,
      expiresAt: new Date(Date.now() + 60000),
    });
    expect(await users.resolve(login.token)).toBeNull();
    expect(await users.login('edit-worker', 'old-password-123')).toBeNull();
    const second = (await users.login('edit-worker', 'new-password-123'))!;
    expect(second.user.fullName).toBe('After');
    expect((await handleAudit(request('/api/barbar/audit', second.token), db, users)).status).toBe(403);
    expect((await handleAudit(request('/api/barbar/audit', owner.token), db, users)).status).toBe(200);
    expect((await handleUsers(patch({ ...input, password: '', active: false }), users)).status).toBe(200);
    expect(await users.resolve(second.token)).toBeNull();
    expect(await users.login('edit-worker', 'new-password-123')).toBeNull();
    expect((await handleUsers(patch({ ...owner.user, active: false }), users)).status).toBe(400);
    expect((await handleUsers(patch({ ...input, role: 'admin' }), users)).status).toBe(400);
    for (const password of [123, 0, false, null])
      expect((await handleUsers(patch({ ...input, password }), users)).status).toBe(400);
    const events = await db.collection('auditEvents').find({ targetId: worker.id }).toArray();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.actor.id === owner.user.id)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('new-password-123');
  });
  it('serializes concurrent owner revocations so one active owner always remains', async () => {
    const race = client.db(`${db.databaseName}_race`);
    try {
      const hash = await hashPassword('race-owner-password');
      for (const [id, username] of [
        ['initial-owner', 'race-one'],
        ['initial-worker', 'race-two'],
      ])
        await race.collection('users').insertOne({
          _id: id as never,
          id,
          username,
          fullName: username,
          email: '',
          phone: '',
          role: 'owner',
          active: true,
          createdAt: '',
          passwordHash: hash,
        });
      const identities = mongoUsers(race);
      const one = (await identities.login('race-one', 'race-owner-password'))!;
      const two = (await identities.login('race-two', 'race-owner-password'))!;
      const patch = (actor: typeof one, target: typeof one) =>
        new Request(origin + '/api/barbar/users', {
          method: 'PATCH',
          headers: { origin, cookie: sessionCookie(new Request(origin), actor.token) },
          body: JSON.stringify({ ...target.user, active: false }),
        });
      const results = await Promise.all([
        handleUsers(patch(one, two), identities),
        handleUsers(patch(two, one), identities),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await race.collection('users').countDocuments({ role: 'owner', active: true })).toBe(1);
    } finally {
      await race.dropDatabase();
    }
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

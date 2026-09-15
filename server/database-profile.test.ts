import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localDatabaseProfile, productionDatabaseError } from './database-profile';

const file = (content: string, mode = 0o600) => {
  const path = join(mkdtempSync(join(tmpdir(), 'barbar-profile-')), '.env.production-db');
  writeFileSync(path, content);
  chmodSync(path, mode);
  return path;
};
const production = { BARBAR_LOCAL_DATABASE: 'production' };
describe('local Production database profile', () => {
  it('explains connection failures without exposing driver messages or credentials', () => {
    const secret = 'mongodb+srv://user:private-password@example.net';
    expect(productionDatabaseError({ code: 18, message: secret })).toContain('логин или пароль');
    expect(productionDatabaseError({ code: 13, message: secret })).toContain('нет доступа');
    expect(productionDatabaseError({ name: 'MongoParseError', message: secret })).toContain('URI');
    expect(productionDatabaseError({ name: 'MongoServerSelectionError', message: secret })).toContain(
      'Network Access',
    );
    expect(productionDatabaseError(new Error(secret))).not.toContain(secret);
  });
  it('stays on the local database unless explicitly selected', () => {
    const path = file('BARBAR_PRODUCTION_MONGODB_URI="mongodb+srv://u:p@cluster.example.net"');
    expect(localDatabaseProfile({}, path)).toEqual({ production: false });
    expect(localDatabaseProfile({ BARBAR_MONGODB_URI: 'mongodb+srv://x' }, path)).toEqual({
      production: false,
    });
  });
  it('requires a private file with a remote URI', () => {
    expect(() => localDatabaseProfile(production, join(tmpdir(), 'missing-barbar-profile'))).toThrow(
      '.env.production-db',
    );
    expect(() =>
      localDatabaseProfile(production, file('BARBAR_PRODUCTION_MONGODB_URI="mongodb+srv://a"', 0o644)),
    ).toThrow('chmod 600');
    expect(() =>
      localDatabaseProfile(production, file('BARBAR_PRODUCTION_MONGODB_URI="mongodb://127.0.0.1:27017"')),
    ).toThrow('Atlas');
    expect(() =>
      localDatabaseProfile(
        production,
        file('BARBAR_PRODUCTION_MONGODB_URI="mongodb+srv://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@barbar.xxxxx.mongodb.net/"'),
      ),
    ).toThrow('примерная строка');
  });
  it('returns the server-side URI without exporting it to process.env', () => {
    const profile = localDatabaseProfile(
      production,
      file('BARBAR_PRODUCTION_MONGODB_URI="mongodb+srv://u:p@cluster.example.net/"\n'),
    );
    expect(profile).toEqual({
      production: true,
      uri: 'mongodb+srv://u:p@cluster.example.net/',
      database: 'barbar',
    });
    expect(process.env.BARBAR_PRODUCTION_MONGODB_URI).toBeUndefined();
  });
  it('encodes a separate database password and rejects an unfilled Atlas placeholder', () => {
    const template = 'BARBAR_PRODUCTION_MONGODB_URI="mongodb+srv://u:<db_password>@cluster.example.net/"';
    expect(() => localDatabaseProfile(production, file(template))).toThrow(
      'BARBAR_PRODUCTION_MONGODB_PASSWORD',
    );
    const profile = localDatabaseProfile(
      production,
      file(`${template}\nBARBAR_PRODUCTION_MONGODB_PASSWORD="a@b:c/#?%"\n`),
    );
    expect(profile.uri).toBe('mongodb+srv://u:a%40b%3Ac%2F%23%3F%25@cluster.example.net/');
    expect(process.env.BARBAR_PRODUCTION_MONGODB_PASSWORD).toBeUndefined();
  });
  it('uses the separate password even when the URI contains an unescaped password', () => {
    const profile = localDatabaseProfile(
      production,
      file(
        'BARBAR_PRODUCTION_MONGODB_URI="mongodb+srv://u:raw/@/#@cluster.example.net/?appName=barbar"\n' +
          'BARBAR_PRODUCTION_MONGODB_PASSWORD="actual/@:#?%"\n',
      ),
    );
    expect(profile.uri).toBe('mongodb+srv://u:actual%2F%40%3A%23%3F%25@cluster.example.net/?appName=barbar');
  });
});

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export interface LocalDatabase {
  production: boolean;
  uri?: string;
  database?: string;
}

/** Safe diagnostics: driver messages can contain the URI, so never forward them to the console or browser. */
export function productionDatabaseError(error: unknown): string {
  const failure = error as { code?: number; name?: string; cause?: { code?: string } };
  if (failure?.code === 18 || failure?.name === 'MongoAuthenticationError')
    return 'Atlas отклонил логин или пароль. Проверьте пользователя БД и пароль в .env.production-db; это не пароль входа на сайт MongoDB.';
  if (failure?.code === 13)
    return 'У пользователя Atlas нет доступа к выбранной базе. Проверьте имя базы и права пользователя.';
  if (failure?.name === 'MongoParseError' || failure?.name === 'TypeError')
    return 'Некорректная строка Atlas в .env.production-db. Скопируйте URI из Connect → Drivers; специальные символы пароля нужно URL-кодировать.';
  return 'Не удалось подключиться к Atlas. Проверьте адрес кластера, интернет и доступ текущего IP в Atlas → Network Access. Локальная база не используется вместо рабочей.';
}

/** Explicit opt-in only: `npm run dev:production-db`. The URI stays server-side and outside process.env. */
export function localDatabaseProfile(
  env: NodeJS.ProcessEnv = process.env,
  file = resolve(process.cwd(), '.env.production-db'),
): LocalDatabase {
  if (env.BARBAR_LOCAL_DATABASE !== 'production') return { production: false };
  if (!existsSync(file))
    throw new Error('Создайте .env.production-db по примеру .env.production-db.example.');
  if ((statSync(file).mode & 0o077) !== 0) throw new Error('Выполните chmod 600 .env.production-db.');
  const values = parseEnv(readFileSync(file, 'utf8'));
  const template = values.BARBAR_PRODUCTION_MONGODB_URI?.trim();
  const password = values.BARBAR_PRODUCTION_MONGODB_PASSWORD;
  let uri = template;
  if (template && password) {
    // The separate password is authoritative even if a raw password was pasted into
    // the URI. Raw slashes/@/# must not be parsed as URL separators before encoding.
    const start = template.indexOf('://') + 3;
    const colon = template.indexOf(':', start);
    const at = template.lastIndexOf('@');
    if (start < 3 || colon < start || at <= colon)
      throw new Error('Вставьте URI из Atlas → Connect → Drivers с именем пользователя и <db_password>.');
    uri = template.slice(0, colon + 1) + encodeURIComponent(password) + template.slice(at);
  }
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri) || /^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri))
    throw new Error('Укажите в .env.production-db строку подключения рабочей базы Atlas.');
  // Template values copied from instructions cannot connect; stop before the server starts.
  if (/xxxxx|ПОЛЬЗОВАТЕЛЬ|ПАРОЛЬ|<[^>]+>/i.test(uri))
    throw new Error(
      'В .env.production-db осталась примерная строка. Вставьте URI из Atlas → Connect → Drivers и пароль пользователя БД в BARBAR_PRODUCTION_MONGODB_PASSWORD либо полный URI с паролем.',
    );
  const database = values.BARBAR_PRODUCTION_MONGODB_DATABASE?.trim() || 'barbar';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(database)) throw new Error('Некорректное имя рабочей базы.');
  return { production: true, uri, database };
}

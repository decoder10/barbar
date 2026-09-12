import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import auth from '../netlify/functions/barbar-auth';
import { handleBarApi } from '../netlify/lib/barbar-handler';
import type { Storage } from '../netlify/lib/barbar-repository';

export function localApi(): Plugin {
  return {
    name: 'barbar-node-api',
    apply: 'serve',
    configureServer(server) {
      // Development secrets are loaded from a Git-ignored .env file.
      const environment = loadEnv('development', process.cwd(), 'BARBAR_');
      process.env.BARBAR_USERNAME ||= environment.BARBAR_USERNAME || 'barbar';
      process.env.BARBAR_PASSWORD ||= environment.BARBAR_PASSWORD;
      const folder = resolve(process.cwd(), '.barbar-data');
      let lock = Promise.resolve();
      const read: Storage['read'] = async (key) => {
        try {
          return JSON.parse(await readFile(resolve(folder, key), 'utf8'));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
          }
          throw error;
        }
      };
      const storage: Storage = {
        read,
        write: (key, value, condition) => {
          const work = lock.then(async () => {
            const old = await read(key);
            if (
              ('onlyIfNew' in condition && old) ||
              ('onlyIfMatch' in condition && old?.etag !== condition.onlyIfMatch)
            ) {
              return { modified: false };
            }
            const file = resolve(folder, key);
            const etag = `"${crypto.randomUUID()}"`;
            await mkdir(dirname(file), { recursive: true });
            const temporary = `${file}.${crypto.randomUUID()}.tmp`;
            await writeFile(temporary, JSON.stringify({ value, etag }, null, 2));
            await rename(temporary, file);
            return { modified: true, etag };
          });
          lock = work.then(
            () => undefined,
            () => undefined,
          );
          return work;
        },
        remove: (key) => rm(resolve(folder, key), { force: true }),
      };
      server.middlewares.use(async (request, response, next) => {
        if (!['/api/barbar', '/api/barbar/auth'].includes((request.url || '').split('?')[0])) {
          next();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > 3_000_000) {
              response.writeHead(413);
              response.end();
              return;
            }
            chunks.push(chunk);
          }
          const headers = new Headers();
          Object.entries(request.headers).forEach(([key, value]) => {
            if (value) {
              headers.set(key, Array.isArray(value) ? value.join(',') : value);
            }
          });
          const url = `http://${request.headers.host}${request.url}`;
          const input = new Request(url, {
            method: request.method,
            headers,
            ...(!['GET', 'HEAD'].includes(request.method || 'GET') ? { body: Buffer.concat(chunks) } : {}),
          });
          const result = request.url?.startsWith('/api/barbar/auth')
            ? await auth(input)
            : await handleBarApi(input, storage);
          response.writeHead(result.status, Object.fromEntries(result.headers));
          response.end(Buffer.from(await result.arrayBuffer()));
        } catch {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Ошибка локального Node.js-сервера.' }));
        }
      });
    },
  };
}

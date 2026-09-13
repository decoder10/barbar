import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import auth from '../netlify/functions/barbar-auth';
import { handleBarApi } from '../netlify/lib/barbar-handler';
import { readSnapshot, type Storage } from '../netlify/lib/barbar-repository';
import { mongoConnection, mongoRepository } from '../netlify/lib/barbar-mongo';

export function localApi(): Plugin {
  return {
    name: 'barbar-node-api',
    apply: 'serve',
    configureServer(server) {
      // Development secrets are loaded from a Git-ignored .env file.
      const environment = loadEnv('development', process.cwd(), 'BARBAR_');
      for (const [key, value] of Object.entries(environment)) process.env[key] ||= value;
      const folder = resolve(process.cwd(), '.barbar-data');
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
      const legacy: Storage = {
        read,
        write: async () => {
          throw new Error('Legacy storage is read-only');
        },
        remove: async () => {
          throw new Error('Legacy storage is read-only');
        },
      };
      const { client, db } = mongoConnection(true);
      const repository = mongoRepository(client, db, async () => (await readSnapshot(legacy)).data);
      server.httpServer?.once('close', () => {
        void client.close();
      });
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
            : await handleBarApi(input, repository);
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

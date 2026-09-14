import { handlePush } from '../netlify/lib/notifications/subscriptions';
import { safelyDeliverStockAlerts } from '../netlify/lib/notifications/deliver';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { handleReport } from '../netlify/lib/queries/report';
import { handleHistory } from '../netlify/lib/queries/history';
import { handleAudit } from '../netlify/lib/audit/handler';
import { handleBarApi } from '../netlify/lib/barbar-handler';
import { mongoConnection, mongoRepository } from '../netlify/lib/barbar-mongo';
import { handleRates } from '../netlify/lib/barbar-rates';
import { readSnapshot, type Storage } from '../netlify/lib/barbar-repository';
import { handleAuth, handleUsers } from '../netlify/lib/barbar-user-handler';
import { mongoUsers } from '../netlify/lib/barbar-users';

export function localApi(): Plugin {
  return {
    name: 'barbar-node-api',
    apply: 'serve',
    configureServer(server) {
      // Development secrets are loaded from a Git-ignored .env file.
      if (existsSync('.env.push')) process.loadEnvFile('.env.push');
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
      const users = mongoUsers(db);
      const repository = mongoRepository(client, db, async () => (await readSnapshot(legacy)).data);
      server.httpServer?.once('close', () => {
        void client.close();
      });
      server.middlewares.use(async (request, response, next) => {
        if (
          ![
            '/api/barbar',
            '/api/barbar/catalog',
            '/api/barbar/catalog/alcohol',
            '/api/barbar/catalog/cocktails',
            '/api/barbar/auth',
            '/api/barbar/users',
            '/api/barbar/rates',
            '/api/barbar/audit',
            '/api/barbar/history',
            '/api/barbar/report',
            '/api/barbar/push',
          ].includes((request.url || '').split('?')[0])
        ) {
          next();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let length = 0;
          const limit = request.url?.split('?')[0] === '/api/barbar' ? 3_000_000 : 4096;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > limit) {
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
          const result = request.url?.startsWith('/api/barbar/push')
            ? await handlePush(input, db, users)
            : request.url?.startsWith('/api/barbar/report')
              ? await handleReport(input, db, users)
              : request.url?.startsWith('/api/barbar/history')
                ? await handleHistory(input, db, users)
                : request.url?.startsWith('/api/barbar/audit')
                  ? await handleAudit(input, db, users)
                  : request.url?.startsWith('/api/barbar/rates')
                    ? await handleRates(input)
                    : request.url?.startsWith('/api/barbar/auth')
                      ? await handleAuth(input, users)
                      : request.url?.startsWith('/api/barbar/users')
                        ? await handleUsers(input, users)
                        : await handleBarApi(input, repository, users);
          if (input.method === 'POST' && new URL(input.url).pathname === '/api/barbar' && result.ok)
            await safelyDeliverStockAlerts(db);
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

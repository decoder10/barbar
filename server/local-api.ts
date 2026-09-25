import { handleGuestOrder } from '../netlify/lib/guest-order-handler';
import { guestOrderStore } from '../netlify/lib/guest-order-store';
import { handlePush } from '../netlify/lib/notifications/subscriptions';
import { handleNotificationsFeed } from '../netlify/lib/notifications/feed';
import { safelyDeliverNotifications } from '../netlify/lib/notifications/deliver';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { handlePhotoFile } from '../netlify/lib/photos/serve';
import { folderPhotoFiles } from '../netlify/lib/photos/store';
import { handlePhotoUpload, maxUploadBytes } from '../netlify/lib/photos/upload';
import { loadEnv, type Plugin } from 'vite';
import { handleReport } from '../netlify/lib/queries/report';
import { handleHistory } from '../netlify/lib/queries/history';
import { handleAudit } from '../netlify/lib/audit/handler';
import { handleBarApi } from '../netlify/lib/barbar-handler';
import { mongoConnection, mongoRepository } from '../netlify/lib/barbar-mongo';
import { json } from '../netlify/lib/barbar-auth';
import { handleGuestMenu } from '../netlify/lib/guest-menu-handler';
import { handleBatches } from '../netlify/lib/queries/batches';
import { localDatabaseProfile, productionDatabaseError } from './database-profile';
import { handleRates } from '../netlify/lib/barbar-rates';
import { readSnapshot, type Storage } from '../netlify/lib/barbar-repository';
import { handleAuth, handleUsers } from '../netlify/lib/barbar-user-handler';
import { mongoUsers } from '../netlify/lib/barbar-users';

export function localApi(): Plugin {
  return {
    name: 'barbar-node-api',
    apply: 'serve',
    async configureServer(server) {
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
      const profile = localDatabaseProfile();
      let connection: ReturnType<typeof mongoConnection>;
      try {
        connection = mongoConnection(
          true,
          undefined,
          profile.production ? { uri: profile.uri!, database: profile.database! } : undefined,
        );
      } catch (error) {
        if (profile.production) throw new Error(productionDatabaseError(error));
        throw error;
      }
      const { client, db } = connection;
      if (profile.production) {
        try {
          await client.connect();
          const meta = await db.collection('state').findOne({ _id: 'state' as never });
          if (meta?.readModelVersion !== 1) {
            await client.close();
            throw new Error('BARBAR_DATABASE_NOT_READY');
          }
        } catch (error) {
          await client.close();
          throw new Error(
            error instanceof Error && error.message === 'BARBAR_DATABASE_NOT_READY'
              ? 'Рабочая база не найдена или требует миграции. Проверьте имя базы; миграции выполняет опубликованное приложение.'
              : productionDatabaseError(error),
          );
        }
        server.config.logger.warn(
          `\n  ВНИМАНИЕ: локальный сервер подключён к рабочей БД Production (${profile.database}). Все операции реальные.\n`,
        );
      }
      const users = mongoUsers(db, { bootstrap: !profile.production });
      const repository = profile.production
        ? mongoRepository(
            client,
            db,
            async () => {
              throw new Error('Production database is never initialised from local files');
            },
            { migrations: false },
          )
        : mongoRepository(client, db, async () => (await readSnapshot(legacy)).data);
      server.httpServer?.once('close', () => {
        void client.close();
      });
      // Owner photos stay next to the local data, outside Git.
      const photos = folderPhotoFiles(resolve(folder, 'photos'));
      const reply = async (response: ServerResponse, result: Response) => {
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
      };
      server.middlewares.use(async (request, response, next) => {
        const path = (request.url || '').split('?')[0];
        const plain = () => {
          const headers = new Headers();
          Object.entries(request.headers).forEach(([key, value]) => {
            if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
          });
          return new Request(`http://${request.headers.host}${request.url}`, {
            method: request.method,
            headers,
          });
        };
        // Same as `netlify/functions/barbar-menu-page.ts`: the guest menu is rendered with its prices.
        // The module is loaded through Vite, so edits to the menu components apply on reload.
        if (/^\/menu\/?$/.test(path)) {
          try {
            const { handleGuestMenuPage, siteHeaders } = (await server.ssrLoadModule(
              '/netlify/lib/guest-menu-page.tsx',
            )) as typeof import('../netlify/lib/guest-menu-page');
            const template = async () =>
              server.transformIndexHtml(
                '/menu.html',
                await readFile(resolve(server.config.root, 'menu.html'), 'utf8'),
              );
            const result = await handleGuestMenuPage(plain(), repository, template, 'local');
            // Like every other local page, no site headers: the CSP would block Vite's inline refresh script.
            for (const name of Object.keys(siteHeaders)) result.headers.delete(name);
            await reply(response, result);
          } catch (error) {
            server.ssrFixStacktrace(error as Error);
            next(error);
          }
          return;
        }
        if (path.startsWith('/api/photos/')) {
          await reply(response, await handlePhotoFile(plain(), photos));
          return;
        }
        if ((request.url || '').split('?')[0] === '/api/barbar/environment') {
          const result = json({
            database: profile.production ? 'production' : 'local',
            name: db.databaseName,
          });
          response.writeHead(result.status, Object.fromEntries(result.headers));
          response.end(await result.text());
          return;
        }
        if (
          ![
            '/api/menu',
            '/api/guest-order',
            '/api/barbar/shifts',
            '/api/barbar/guest-requests',
            '/api/barbar',
            '/api/barbar/catalog',
            '/api/barbar/catalog/alcohol',
            '/api/barbar/catalog/cocktails',
            '/api/barbar/catalog/cards',
            '/api/barbar/orders',
            '/api/barbar/orders/recent',
            '/api/barbar/favorites',
            '/api/barbar/auth',
            '/api/barbar/users',
            '/api/barbar/rates',
            '/api/barbar/audit',
            '/api/barbar/history',
            '/api/barbar/batches',
            '/api/barbar/report',
            '/api/barbar/report/compare',
            '/api/barbar/prices',
            '/api/barbar/push',
            '/api/barbar/notifications',
            '/api/barbar/photos',
          ].includes((request.url || '').split('?')[0])
        ) {
          next();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let length = 0;
          // Photos: the handler answers an oversized upload itself, with a readable error.
          const limit =
            path === '/api/barbar' ? 3_000_000 : path === '/api/barbar/photos' ? maxUploadBytes * 2 : 12000;
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
          const result = request.url?.startsWith('/api/guest-order')
            ? await handleGuestOrder(input, guestOrderStore(db, { migrations: !profile.production }))
            : request.url?.startsWith('/api/menu')
              ? await handleGuestMenu(input, repository)
              : path === '/api/barbar/photos'
                ? await handlePhotoUpload(input, users, photos)
                : request.url?.startsWith('/api/barbar/batches')
                  ? await handleBatches(input, db, users)
                  : request.url?.startsWith('/api/barbar/notifications')
                    ? await handleNotificationsFeed(input, db, users)
                    : request.url?.startsWith('/api/barbar/push')
                      ? await handlePush(input, db, users)
                      : request.url?.startsWith('/api/barbar/report') ||
                          request.url?.startsWith('/api/barbar/prices')
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
          if (
            input.method === 'POST' &&
            ['/api/barbar', '/api/guest-order'].includes(new URL(input.url).pathname) &&
            result.ok
          )
            await safelyDeliverNotifications(db);
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

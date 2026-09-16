import { publicStock, publicCatalog, publicCatalogPart, mutationResponse } from './barbar-sync';
import { commandAudit } from './audit/store';
import { applyCommand, stockTotals } from '../../src/barbar/domain/model';
import type { BarData, Command } from '../../src/barbar/domain/types';
import type { UserProfile } from '../../src/barbar/domain/identity/user';
import { publicSnapshot } from './barbar-access';
import { cardPage, parseCardQueries } from '../../src/barbar/domain/catalog/cards';
import { barConfig } from '../../src/barbar/config';
import { businessDaysBefore } from '../../src/barbar/domain/business-day';
import { authenticated, json, roleFor, sameOrigin } from './barbar-auth';
import type { Repository } from './barbar-repository';
import type { IdentityStore } from './barbar-users';

export const handleBarApi = async (
  request: Request,
  repository: Repository,
  users: IdentityStore,
  resolvedUser?: UserProfile,
) => {
  const user = resolvedUser || (await authenticated(request, users));
  if (!user) {
    return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  }
  const role = roleFor(user);
  if (!['GET', 'POST'].includes(request.method)) {
    return json({ error: 'Метод не поддерживается.' }, 405);
  }
  if (request.method === 'POST' && !sameOrigin(request)) {
    return json({ error: 'Недопустимый источник запроса.' }, 403);
  }
  try {
    const split = request.headers.get('X-Barbar-Protocol') === '2' && !!repository.readStock;
    if (new URL(request.url).pathname === '/api/barbar/catalog/cards') {
      if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
      const params = new URL(request.url).searchParams;
      // One screen asks for cocktails and poured alcohol at once: `resources` answers both in a
      // single request, so stock and the popularity window are read once instead of twice.
      const many = params.has('resources');
      let queries: ReturnType<typeof parseCardQueries>;
      try {
        queries = parseCardQueries(params);
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
      // Server-side search and order over the whole catalog; the page carries IDs and stock only.
      const catalogs = await Promise.all(
        queries.map((query) =>
          repository.readCatalog
            ? repository.readCatalog(undefined, query.resource)
            : repository.read().then((s) => ({ catalogRevision: '', data: s.data })),
        ),
      );
      const stockSnapshot = repository.readStock ? await repository.readStock() : undefined;
      const stock = stockSnapshot?.stock
        ? new Map(stockSnapshot.stock.map((b) => [b.alcoholId, b.ml]))
        : stockTotals((await repository.read()).data);
      // «Most sold first» counts a window of business days ending on the requested day.
      const first = queries[0];
      const popularity =
        first.sort === 'popular' && first.date && repository.salesPopularity
          ? await repository.salesPopularity(
              businessDaysBefore(first.date, barConfig.presets.popularityDays - 1),
              first.date,
            )
          : undefined;
      const pages = queries.map((query, index) => cardPage(catalogs[index].data!, stock, query, popularity));
      const common = {
        catalogRevision: catalogs[0].catalogRevision,
        revision: stockSnapshot?.revision || null,
        role,
      };
      return json(many ? { pages, ...common } : { ...pages[0], ...common });
    }
    const catalogRoute = new URL(request.url).pathname.match(
      /^\/api\/barbar\/catalog(?:\/(alcohol|cocktails))?$/,
    );
    if (catalogRoute) {
      if (request.method !== 'GET' || !repository.readCatalog)
        return json({ error: 'Метод не поддерживается.' }, 405);
      const known =
        request.headers.get('X-Barbar-Role') === role
          ? request.headers.get('X-Barbar-Catalog-Revision') || undefined
          : undefined;
      const resource = catalogRoute[1] as 'alcohol' | 'cocktails' | undefined;
      const snapshot = await repository.readCatalog(known, resource);
      return json(resource ? publicCatalogPart(snapshot, role, resource) : publicCatalog(snapshot, role));
    }
    if (request.method === 'GET') {
      if (new URL(request.url).searchParams.get('view') === 'full') {
        if (role !== 'admin') return json({ error: 'Полная копия доступна только владельцу.' }, 403);
        const full = await repository.read();
        if (JSON.stringify(full.data).length > 3_000_000)
          return json(
            {
              error:
                'Для этой истории используйте зашифрованную копию с компьютера: npm run db:backup. Копия через браузер ограничена 3 МБ.',
            },
            413,
          );
        return json(publicSnapshot(full.data, full.revision, role));
      }
      const previous = request.headers.get('X-Barbar-Revision');
      if (split)
        return json(
          publicStock(
            await repository.readStock!(
              request.headers.get('X-Barbar-Role') === role ? previous || undefined : undefined,
            ),
            role,
          ),
        );
      if (previous && request.headers.get('X-Barbar-Role') === role && repository.readRevision) {
        const revision = await repository.readRevision();
        if (revision && previous === revision) return json({ unchanged: true, revision, role });
      }
      const current = await (repository.readWorking || repository.read)();
      return json(publicSnapshot(current.data, current.revision, role));
    }
    const body = await request.text();
    if (body.length > 3_000_000) {
      return json({ error: 'Файл слишком большой (максимум 3 МБ).' }, 413);
    }
    let input: { command: Command; revision: string | null };
    try {
      input = JSON.parse(body);
      if (!input || typeof input !== 'object') throw new Error('Invalid request');
    } catch {
      return json({ error: 'Некорректный JSON.' }, 400);
    }
    if (role !== 'admin' && !['sale', 'createCocktail', 'updateRecipe'].includes(input?.command?.type)) {
      return json({ error: 'Эта операция доступна только администратору.' }, 403);
    }
    if (repository.execute) {
      const result = await repository.execute(input.command, user);
      if (result)
        return json(
          split
            ? await mutationResponse(result, role, input.command, input.revision, repository)
            : publicSnapshot(result.data, result.revision, role),
        );
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await repository.read();
      if (
        ['restore', 'purge', 'correctPurchase'].includes(input.command?.type) &&
        !current.data.operations.includes(input.command.id) &&
        input.revision !== current.revision
      ) {
        return json(
          {
            error: 'Данные изменились на другом устройстве. Обновите страницу перед изменением истории.',
          },
          409,
        );
      }
      let next: BarData;
      try {
        next = applyCommand(current.data, input.command);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Некорректная операция.' }, 400);
      }
      if (next === current.data) {
        const snapshot = repository.readWorking ? await repository.readWorking() : current;
        return json(
          split
            ? await mutationResponse(snapshot, role, input.command, input.revision, repository)
            : publicSnapshot(snapshot.data, snapshot.revision, role),
        );
      }
      if (!repository.execute && JSON.stringify(next).length > 3_000_000) {
        return json(
          {
            error:
              'История достигла лимита этой версии (3 МБ). Скачайте резервную копию и удалите старые продажи в разделе «Данные и копии».',
          },
          413,
        );
      }
      const result = await repository.commit(current, next, commandAudit(input.command, next, user));
      if (result.modified) {
        const snapshot = repository.readWorking
          ? await repository.readWorking()
          : { data: next, revision: result.revision || null, days: {} };
        return json({
          ...(split
            ? await mutationResponse(snapshot, role, input.command, input.revision, repository)
            : publicSnapshot(snapshot.data, snapshot.revision, role)),
          warning: result.cleanupPending
            ? 'Операция сохранена, но часть устаревших файлов пока не удалена из хранилища. Обратитесь к владельцу сайта.'
            : undefined,
        });
      }
    }
    return json({ error: 'Другое устройство обновляет данные. Повторите операцию.' }, 409);
  } catch (error) {
    if ((error as { status?: number })?.status === 400) return json({ error: (error as Error).message }, 400);
    console.error('Barbar storage error', error instanceof Error ? error.name : 'UnknownError');
    return json(
      { error: 'Хранилище временно недоступно. Проверьте подключение и повторите попытку в той же форме.' },
      503,
    );
  }
};

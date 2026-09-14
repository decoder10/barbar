import { applyCommand } from '../../src/barbar/domain/model';
import type { BarData, Command } from '../../src/barbar/domain/types';
import type { UserProfile } from '../../src/barbar/domain/identity/user';
import { publicSnapshot } from './barbar-access';
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
    if (request.method === 'GET') {
      const previous = request.headers.get('X-Barbar-Revision');
      if (previous && request.headers.get('X-Barbar-Role') === role && repository.readRevision) {
        const revision = await repository.readRevision();
        if (revision && previous === revision) return json({ unchanged: true, revision, role });
      }
      const current = await repository.read();
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
        return json(publicSnapshot(current.data, current.revision, role));
      }
      if (JSON.stringify(next).length > 3_000_000) {
        return json(
          {
            error:
              'История достигла лимита этой версии (3 МБ). Скачайте резервную копию и удалите старые продажи в разделе «Данные и копии».',
          },
          413,
        );
      }
      const result = await repository.commit(current, next);
      if (result.modified) {
        return json({
          ...publicSnapshot(next, result.revision, role),
          warning: result.cleanupPending
            ? 'Операция сохранена, но часть устаревших файлов пока не удалена из хранилища. Обратитесь к владельцу сайта.'
            : undefined,
        });
      }
    }
    return json({ error: 'Другое устройство обновляет данные. Повторите операцию.' }, 409);
  } catch (error) {
    console.error('Barbar storage error', error instanceof Error ? error.name : 'UnknownError');
    return json(
      { error: 'Хранилище временно недоступно. Проверьте подключение и повторите попытку в той же форме.' },
      503,
    );
  }
};

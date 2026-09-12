import { applyCommand } from '../../src/barbar/model';
import type { BarData, Command } from '../../src/barbar/types';
import { authenticated, json, sameOrigin } from './barbar-auth';
import { commitSnapshot, readSnapshot, type Storage } from './barbar-repository';

export const handleBarApi = async (request: Request, storage: Storage) => {
  if (!authenticated(request)) {
    return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  }
  if (!['GET', 'POST'].includes(request.method)) {
    return json({ error: 'Метод не поддерживается.' }, 405);
  }
  if (request.method === 'POST' && !sameOrigin(request)) {
    return json({ error: 'Недопустимый источник запроса.' }, 403);
  }
  try {
    if (request.method === 'GET') {
      const current = await readSnapshot(storage);
      return json({ data: current.data, revision: current.revision });
    }
    const body = await request.text();
    if (body.length > 3_000_000) {
      return json({ error: 'Файл слишком большой (максимум 3 МБ).' }, 413);
    }
    let input: { command: Command; revision: string | null };
    try {
      input = JSON.parse(body);
    } catch {
      return json({ error: 'Некорректный JSON.' }, 400);
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await readSnapshot(storage);
      if (['restore', 'purge'].includes(input.command?.type) && input.revision !== current.revision) {
        return json(
          {
            error:
              'Данные изменились на другом устройстве. Обновите страницу перед очисткой или восстановлением.',
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
        return json({ data: current.data, revision: current.revision });
      }
      if (JSON.stringify(next).length > 3_000_000) {
        return json(
          {
            error:
              'История достигла лимита этой версии (3 МБ). Скачайте резервную копию и удалите старые продажи в разделе «Файлы и копии».',
          },
          413,
        );
      }
      const result = await commitSnapshot(storage, current, next);
      if (result.modified) {
        return json({
          data: next,
          revision: result.revision,
          warning: result.cleanupPending
            ? 'Операция сохранена, но часть устаревших файлов пока не удалена из хранилища. Обратитесь к владельцу сайта.'
            : undefined,
        });
      }
    }
    return json({ error: 'Другое устройство обновляет данные. Повторите операцию.' }, 409);
  } catch (error) {
    console.error('Barbar storage error', error);
    return json(
      { error: 'Хранилище временно недоступно. Проверьте подключение и повторите попытку в той же форме.' },
      503,
    );
  }
};

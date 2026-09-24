import { mutationResponse } from '../barbar-sync';
import { commandAudit } from '../audit/store';
import { applyCommand } from '../../../src/barbar/domain/model';
import type { BarData, Command } from '../../../src/barbar/domain/types';
import type { UserProfile } from '../../../src/barbar/domain/identity/user';
import { publicSnapshot } from '../barbar-access';
import { json, type Role } from '../barbar-auth';
import type { Repository, Snapshot } from '../barbar-repository';
import { HttpError } from '../http';

/** Worker commands are an allowlist; the domain then validates every field of every command. */
const workerCommands = [
  'closeShift',
  'acceptGuestRequest',
  'rejectGuestRequest',
  'sale',
  'addLines',
  'createCocktail',
  'updateRecipe',
  'openOrder',
  'payOrder',
  'cancelOrder',
  'removeLine',
];
/** History edits must start from the state the client saw. */
const historyCommands = ['restore', 'purge', 'correctPurchase'];

async function parseInput(request: Request) {
  const body = await request.text();
  if (body.length > 3_000_000) throw new HttpError('Файл слишком большой (максимум 3 МБ).', 413);
  let input: { command: Command; revision: string | null };
  try {
    input = JSON.parse(body);
    if (!input || typeof input !== 'object') throw new Error('Invalid request');
  } catch {
    throw new HttpError('Некорректный JSON.', 400);
  }
  return input;
}

/** A ledger command: transactional when the repository executes it, otherwise the compatible read-apply-commit loop. */
export async function handleCommand(
  request: Request,
  repository: Repository,
  user: UserProfile,
  role: Role,
  split: boolean,
) {
  const input = await parseInput(request);
  if (role !== 'admin' && !workerCommands.includes(input?.command?.type))
    return json({ error: 'Эта операция доступна только администратору.' }, 403);
  // Who acts comes from the session, never from the body: receipts record the opener and the closer.
  const context = { actor: { id: user.id, fullName: user.fullName } };
  const respond = async (snapshot: Snapshot, warning?: string) =>
    json({
      ...(split
        ? await mutationResponse(snapshot, role, input.command, input.revision, repository)
        : publicSnapshot(snapshot.data, snapshot.revision, role)),
      ...(warning ? { warning } : {}),
    });
  if (repository.execute) {
    const result = await repository.execute(input.command, user, context);
    if (result) return respond(result);
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await repository.read();
    if (
      historyCommands.includes(input.command?.type) &&
      !current.data.operations.includes(input.command.id) &&
      input.revision !== current.revision
    )
      return json(
        { error: 'Данные изменились на другом устройстве. Обновите страницу перед изменением истории.' },
        409,
      );
    let next: BarData;
    try {
      next = applyCommand(current.data, input.command, context);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Некорректная операция.' }, 400);
    }
    if (next === current.data)
      return respond(repository.readWorking ? await repository.readWorking() : current);
    if (!repository.execute && JSON.stringify(next).length > 3_000_000)
      return json(
        {
          error:
            'История достигла лимита этой версии (3 МБ). Скачайте резервную копию и удалите старые продажи в разделе «Данные и копии».',
        },
        413,
      );
    const result = await repository.commit(
      current,
      next,
      commandAudit(input.command, next, user, current.data),
    );
    if (result.modified)
      return respond(
        repository.readWorking
          ? await repository.readWorking()
          : { data: next, revision: result.revision || null, days: {} },
        result.cleanupPending
          ? 'Операция сохранена, но часть устаревших файлов пока не удалена из хранилища. Обратитесь к владельцу сайта.'
          : undefined,
      );
  }
  return json({ error: 'Другое устройство обновляет данные. Повторите операцию.' }, 409);
}

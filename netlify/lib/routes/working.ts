import { publicStock } from '../barbar-sync';
import { publicSnapshot } from '../barbar-access';
import { json, type Role } from '../barbar-auth';
import type { Repository } from '../barbar-repository';

/** Reads of the working state: the owner's full copy, current stock (protocol 2) or the compatible snapshot. */
export async function handleWorkingRead(
  request: Request,
  repository: Repository,
  role: Role,
  split: boolean,
) {
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
  const sameRole = request.headers.get('X-Barbar-Role') === role;
  if (split)
    return json(publicStock(await repository.readStock!(sameRole ? previous || undefined : undefined), role));
  if (previous && sameRole && repository.readRevision) {
    const revision = await repository.readRevision();
    if (revision && previous === revision) return json({ unchanged: true, revision, role });
  }
  const current = await (repository.readWorking || repository.read)();
  return json(publicSnapshot(current.data, current.revision, role));
}

import { initialData } from '../../src/barbar/domain/model';
import { mongoConnection, mongoRepository, type DeployInfo } from './barbar-mongo';
import type { Repository } from './barbar-repository';

let repository: Repository | undefined;
/** Read-only catalog access for the public menu functions (`/api/menu`, `/menu`). */
export function guestRepository(deploy: DeployInfo) {
  if (!repository) {
    const { client, db } = mongoConnection(false, deploy);
    repository = mongoRepository(client, db, async () => {
      // A public request never imports the live ledger; the authenticated app does that once.
      if (deploy.context !== 'production') return initialData();
      throw new Error('Ledger is not initialised');
    });
  }
  return repository;
}

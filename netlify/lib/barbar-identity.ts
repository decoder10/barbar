import { mongoConnection, type DeployInfo } from './barbar-mongo';
import { mongoUsers, type IdentityStore } from './barbar-users';
let identities: IdentityStore | undefined;
export function identityStore(deploy: DeployInfo) {
  if (!identities) identities = mongoUsers(mongoConnection(false, deploy).db);
  return identities;
}

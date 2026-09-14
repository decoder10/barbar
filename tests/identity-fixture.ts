import { handleBarApi as handle } from '../netlify/lib/barbar-handler';
import type { Repository } from '../netlify/lib/barbar-repository';
import { handleAuth } from '../netlify/lib/barbar-user-handler';
import type { IdentityStore } from '../netlify/lib/barbar-users';
import type { UserProfile } from '../src/barbar/domain/identity/user';
const user = (role: 'admin' | 'barbar'): UserProfile => ({
  id: role,
  username: role,
  fullName: role,
  email: '',
  phone: '',
  role: role === 'admin' ? 'owner' : 'worker',
  active: true,
  createdAt: '',
});
// Used only for ledger tests; database identity and session security have separate integration tests.
export const identity: IdentityStore = {
  resolve: async (token) => (token === 'admin' || token === 'barbar' ? user(token) : null),
  login: async (username, password) => {
    if (username !== 'admin' && username !== 'barbar') return null;
    if (password !== process.env[username === 'admin' ? 'BARBAR_ADMIN_PASSWORD' : 'BARBAR_PASSWORD'])
      return null;
    return { user: user(username), token: username };
  },
  revoke: async () => {},
  list: async () => [],
  create: async () => {
    throw new Error('unused');
  },
};
export const handleBarApi = (request: Request, repository: Repository) =>
  handle(request, repository, identity);
export const auth = (request: Request) => handleAuth(request, identity);

import type { UserProfile } from './user';
export interface AuditEvent {
  id: string;
  createdAt: string;
  actor: Pick<UserProfile, 'id' | 'fullName' | 'role'>;
  action: string;
  targetId: string;
  summary: string;
}

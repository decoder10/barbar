import type { Preferences } from './preferences';
export type UserRole = 'owner' | 'worker';
export interface UserProfile {
  preferences?: Preferences;
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}
export interface UserInput {
  username: string;
  password: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
}

import { useCallback, useEffect, useState } from 'react';
import type { UserProfile } from '../../domain/identity/user';
import { api } from '../../services/api-client';

/** The team list for the owner's screens; one loader with the same loading and error state everywhere. */
export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers((await api('/api/barbar/users')).users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить пользователей.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { users, setUsers, loading, error, reload: load };
}

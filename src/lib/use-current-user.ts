'use client';

import { useEffect, useState } from 'react';
import { AppRole, canEditSites, canManageBilling } from './permissions';

export type ClientRole = AppRole;

export interface CurrentUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: ClientRole;
  contractorIds: string[];
}

export { canEditSites, canManageBilling };

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchSession() {
      try {
        const response = await fetch('/api/auth/session');
        const session = await response.json();
        const sessionUser = session?.user;

        if (isMounted && sessionUser?.id && sessionUser?.role) {
          setUser({
            id: sessionUser.id,
            email: sessionUser.email,
            name: sessionUser.name,
            role: sessionUser.role,
            contractorIds: sessionUser.contractorIds || [],
          });
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchSession();

    return () => {
      isMounted = false;
    };
  }, []);

  return { user, isLoading };
}

import { auth } from './auth';
import { AppRole } from './permissions';

export interface AppSessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: AppRole;
}

export async function getCurrentUser(): Promise<AppSessionUser | null> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.role) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as AppRole,
  };
}

export async function requireUser(): Promise<AppSessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return user;
}

export async function requireRole(roles: AppRole[]): Promise<AppSessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return user;
}

export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof Response) {
    return error;
  }
  return null;
}

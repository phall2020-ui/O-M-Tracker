export type AppRole = 'ADMIN' | 'MANAGER' | 'VIEWER' | 'CONTRACTOR';

export const ALL_ROLES: AppRole[] = ['ADMIN', 'MANAGER', 'VIEWER', 'CONTRACTOR'];
export const OPERATIONAL_ROLES: AppRole[] = ['ADMIN', 'MANAGER'];

const pageAccess: Array<{ path: string; exact?: boolean; roles: AppRole[] }> = [
  { path: '/', exact: true, roles: ALL_ROLES },
  { path: '/overview', roles: OPERATIONAL_ROLES },
  { path: '/sites', roles: ALL_ROLES },
  { path: '/pipeline', roles: ALL_ROLES },
  { path: '/spvs', roles: ALL_ROLES },
  { path: '/cmdays', roles: ALL_ROLES },
  { path: '/contractor', roles: ['ADMIN', 'MANAGER', 'CONTRACTOR'] },
  { path: '/import', roles: OPERATIONAL_ROLES },
  { path: '/admin', roles: ['ADMIN'] },
  { path: '/settings', roles: ['ADMIN'] },
];

export function isAppRole(role: unknown): role is AppRole {
  return typeof role === 'string' && ALL_ROLES.includes(role as AppRole);
}

export function rolesForPath(pathname: string): AppRole[] | null {
  const match = pageAccess.find((entry) => (
    entry.exact ? pathname === entry.path : pathname === entry.path || pathname.startsWith(`${entry.path}/`)
  ));

  return match?.roles || null;
}

export function canAccessPath(role: AppRole | null | undefined, pathname: string): boolean {
  const roles = rolesForPath(pathname);
  if (!roles) return true;
  return Boolean(role && roles.includes(role));
}

export function canEditSites(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canAcceptPipelineSites(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'CONTRACTOR';
}

export function canManageImports(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canManageBilling(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canManageAdmin(role?: string | null): boolean {
  return role === 'ADMIN';
}

export function canReviewCmWork(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canCreateCmWork(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'CONTRACTOR';
}

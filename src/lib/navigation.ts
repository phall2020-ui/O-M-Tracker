import {
  Briefcase,
  Building2,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Upload,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { AppRole, ALL_ROLES, OPERATIONAL_ROLES } from './permissions';
import { appendContractQuery } from './contract-query';

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles: AppRole[];
  group: 'Portfolio' | 'Operations';
}

export const navigationItems: NavigationItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ALL_ROLES, group: 'Portfolio' },
  { name: 'Overview', href: '/overview', icon: ShieldCheck, roles: OPERATIONAL_ROLES, group: 'Portfolio' },
  { name: 'Sites', href: '/sites', icon: Building2, roles: ALL_ROLES, group: 'Portfolio' },
  { name: 'Pipeline', href: '/pipeline', icon: ClipboardList, roles: ALL_ROLES, group: 'Portfolio' },
  { name: 'SPV Portfolio', href: '/spvs', icon: Briefcase, roles: ALL_ROLES, group: 'Portfolio' },
  { name: 'CM Review', href: '/cmdays', icon: Wrench, roles: ALL_ROLES, group: 'Operations' },
  { name: 'Contractor Portal', href: '/contractor', icon: HardHat, roles: ['ADMIN', 'MANAGER', 'CONTRACTOR'], group: 'Operations' },
  { name: 'Import Data', href: '/import', icon: Upload, roles: OPERATIONAL_ROLES, group: 'Operations' },
  { name: 'Admin', href: '/admin', icon: ShieldCheck, roles: ['ADMIN'], group: 'Operations' },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['ADMIN'], group: 'Operations' },
];

export function visibleNavigationForRole(role: AppRole | null | undefined): NavigationItem[] {
  if (!role) {
    return navigationItems.filter((item) => item.href === '/');
  }

  return navigationItems.filter((item) => item.roles.includes(role));
}

export function navigationHrefWithContract(href: string, contractId: string | null | undefined): string {
  return appendContractQuery(href, contractId);
}

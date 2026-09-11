import { describe, expect, it } from 'vitest';
import {
  canAcceptPipelineSites,
  canAccessPath,
  canCreateCmWork,
  canEditSites,
  canManageAdmin,
  canManageBilling,
  canManageImports,
  canReviewCmWork,
} from './permissions';
import { visibleNavigationForRole } from './navigation';

describe('role permissions', () => {
  it('lets contractors see portfolio and operational read pages except imports, billing admin, and settings', () => {
    expect(visibleNavigationForRole('CONTRACTOR').map((item) => item.name)).toEqual([
      'Dashboard',
      'Sites',
      'Pipeline',
      'SPV Portfolio',
      'CM Review',
      'Contractor Portal',
    ]);

    expect(canAccessPath('CONTRACTOR', '/')).toBe(true);
    expect(canAccessPath('CONTRACTOR', '/sites')).toBe(true);
    expect(canAccessPath('CONTRACTOR', '/pipeline')).toBe(true);
    expect(canAccessPath('CONTRACTOR', '/spvs')).toBe(true);
    expect(canAccessPath('CONTRACTOR', '/cmdays')).toBe(true);
    expect(canAccessPath('CONTRACTOR', '/contractor')).toBe(true);
    expect(canAccessPath('CONTRACTOR', '/overview')).toBe(false);
    expect(canAccessPath('CONTRACTOR', '/import')).toBe(false);
    expect(canAccessPath('CONTRACTOR', '/admin')).toBe(false);
    expect(canAccessPath('CONTRACTOR', '/settings')).toBe(false);
  });

  it('keeps contractor and viewer write actions scoped', () => {
    expect(canCreateCmWork('CONTRACTOR')).toBe(true);
    expect(canCreateCmWork('VIEWER')).toBe(false);
    expect(canReviewCmWork('CONTRACTOR')).toBe(false);
    expect(canEditSites('CONTRACTOR')).toBe(false);
    expect(canAcceptPipelineSites('CONTRACTOR')).toBe(true);
    expect(canAcceptPipelineSites('VIEWER')).toBe(false);
    expect(canManageImports('CONTRACTOR')).toBe(false);
    expect(canManageBilling('CONTRACTOR')).toBe(false);
    expect(canManageAdmin('CONTRACTOR')).toBe(false);
  });

  it('lets the Ade asset manager role run operational management but not admin-only configuration', () => {
    expect(canEditSites('MANAGER')).toBe(true);
    expect(canAcceptPipelineSites('MANAGER')).toBe(true);
    expect(canReviewCmWork('MANAGER')).toBe(true);
    expect(canManageImports('MANAGER')).toBe(true);
    expect(canManageBilling('MANAGER')).toBe(true);
    expect(canManageAdmin('MANAGER')).toBe(false);
    expect(canAccessPath('MANAGER', '/settings')).toBe(false);
    expect(canAccessPath('MANAGER', '/overview')).toBe(true);
  });
});

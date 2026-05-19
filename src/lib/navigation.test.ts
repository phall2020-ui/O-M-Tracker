import { describe, expect, it } from 'vitest';
import { navigationHrefWithContract, visibleNavigationForRole } from './navigation';

describe('navigation visibility', () => {
  it('lets contractors see portfolio and operations read areas without restricted admin areas', () => {
    expect(visibleNavigationForRole('CONTRACTOR').map((item) => item.name)).toEqual([
      'Dashboard',
      'Sites',
      'Pipeline',
      'SPV Portfolio',
      'CM Review',
      'Contractor Portal',
    ]);
  });

  it('shows admin portfolio and operations areas', () => {
    expect(visibleNavigationForRole('ADMIN').map((item) => item.name)).toContain('Admin');
    expect(visibleNavigationForRole('ADMIN').map((item) => item.name)).toContain('Import Data');
  });

  it('lets view-only users see portfolio pages without admin areas', () => {
    expect(visibleNavigationForRole('VIEWER').map((item) => item.name)).toEqual([
      'Dashboard',
      'Sites',
      'Pipeline',
      'SPV Portfolio',
      'CM Review',
    ]);
  });

  it('uses least-privilege navigation while the session role hydrates', () => {
    expect(visibleNavigationForRole(undefined).map((item) => item.name)).toEqual([
      'Dashboard',
    ]);
  });

  it('preserves the selected contract in navigation links', () => {
    expect(navigationHrefWithContract('/sites', 'contract 1')).toBe('/sites?contract=contract+1');
  });

  it('leaves navigation links unchanged when no contract is selected', () => {
    expect(navigationHrefWithContract('/sites', null)).toBe('/sites');
  });
});

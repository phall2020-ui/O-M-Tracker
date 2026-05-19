import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { AppSessionUser } from '@/lib/authz';

let currentUser: AppSessionUser | null = null;
const { listSites } = vi.hoisted(() => ({
  listSites: vi.fn(),
}));

vi.mock('../../../../lib/authz', () => ({
  requireUser: vi.fn(async () => {
    if (!currentUser) {
      throw new Response('Unauthorized', { status: 401 });
    }
    return currentUser;
  }),
  authErrorResponse: (error: unknown) => error instanceof Response ? error : null,
}));

vi.mock('../../../../lib/portfolio-repository', () => ({
  listSites,
}));

describe('Excel export API', () => {
  beforeEach(() => {
    currentUser = null;
    listSites.mockResolvedValue([
      {
        id: 'site-1',
        contractId: 'contract-1',
        name: 'Export Test Site',
        systemSizeKwp: 250,
        siteType: 'Rooftop',
        contractStatus: 'Contracted',
        onboardDate: '2026-01-01',
        forecastPacDate: null,
        actualPacDate: null,
        pmCost: 100,
        pmDaysOnSite: 1,
        pmVisitsPerAnnum: 1,
        cctvCost: 25,
        cleaningCost: 50,
        additionalCostAnnual: 0,
        additionalCostAnnualComment: null,
        additionalCostMonthly: 0,
        additionalCostMonthlyComment: null,
        additionalCostMonthlyStartMonth: null,
        additionalCostMonthlyEndMonth: null,
        billingPortfolio: 'CORE',
        spvId: null,
        spvCode: 'ADE',
        spvName: 'ADE Portfolio',
        sourceSheet: null,
        sourceRow: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        siteFixedCosts: 175,
        variableCost: 500,
        annualFee: 675,
        monthlyFee: 56.25,
        feePerKwp: 2.7,
      },
    ]);
  });

  it.each(['ADMIN', 'MANAGER', 'CONTRACTOR', 'VIEWER'] as const)('allows %s to export the standard workbook', async (role) => {
    currentUser = { id: `${role.toLowerCase()}-id`, email: `${role.toLowerCase()}@example.com`, name: role, role };

    const response = await GET(new Request('http://localhost/api/export/excel'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers.get('Content-Disposition')).toContain('clearsol-om-framework-tracker-');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('exports a custom workbook when fields are selected', async () => {
    currentUser = { id: 'viewer-id', email: 'viewer@example.com', name: 'Viewer', role: 'VIEWER' };

    const response = await GET(new Request('http://localhost/api/export/excel?mode=custom&fields=name,spvCode'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('clearsol-sites-custom-export-');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('passes the selected contract to the export data loader', async () => {
    currentUser = { id: 'viewer-id', email: 'viewer@example.com', name: 'Viewer', role: 'VIEWER' };

    const response = await GET(new Request('http://localhost/api/export/excel?contract=contract-2'));

    expect(response.status).toBe(200);
    expect(listSites).toHaveBeenCalledWith(expect.objectContaining({ contractId: 'contract-2' }));
  });

  it('rejects unauthenticated export requests', async () => {
    const response = await GET(new Request('http://localhost/api/export/excel'));

    expect(response.status).toBe(401);
  });
});

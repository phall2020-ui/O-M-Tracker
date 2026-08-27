import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const repository = vi.hoisted(() => ({
  getSpvMonthlyReport: vi.fn(),
  listSites: vi.fn(),
  listSpvs: vi.fn(),
}));

const contracts = vi.hoisted(() => ({
  resolveContractIdForUser: vi.fn(async () => 'contract-1'),
}));

vi.mock('@/lib/portfolio-repository', () => repository);
vi.mock('@/lib/contracts', () => contracts);
vi.mock('@/lib/authz', () => ({
  requireRole: vi.fn(async () => ({ id: 'admin-id', role: 'ADMIN', contractorIds: [] })),
  authErrorResponse: vi.fn(() => null),
}));
vi.mock('@/lib/permissions', () => ({ ALL_ROLES: ['ADMIN', 'MANAGER', 'VIEWER'] }));

describe('SPV invoice API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.listSpvs.mockResolvedValue([{ code: 'FS', name: 'Fylde Solar Ltd' }]);
    repository.listSites.mockResolvedValue([
      {
        id: 'live-site',
        name: 'Live Fylde',
        billingPortfolio: 'CORE',
        contractStatus: 'Contracted',
        systemSizeKwp: 9631,
        monthlyFee: 3341.02,
      },
    ]);
    repository.getSpvMonthlyReport.mockResolvedValue({
      month: '2026-08',
      monthLabel: 'August 2026',
      source: 'billing-snapshots',
      rows: [
        {
          spvCode: 'FS',
          spvName: 'Fylde Solar Ltd',
          billingPortfolio: 'CORE',
          siteCount: 1,
          contractedSiteCount: 1,
          pendingSiteCount: 0,
          totalCapacityKwp: 9631,
          contractedCapacityKwp: 9631,
          siteFixedCostsAnnual: 23719.5,
          variableCostAnnual: 17335.86,
          annualFee: 41055.36,
          monthlyFee: 3421.28,
          averageFeePerKwp: 4.26,
          correctiveDaysAllowed: 0,
          siteLines: [
            {
              id: 'snapshot-1',
              siteId: 'site-1',
              name: 'Fylde',
              contractStatus: 'Contracted',
              systemSizeKwp: 9631,
              pmDaysOnSite: 0,
              pmVisitsPerAnnum: 0,
              siteFixedCosts: 23719.5,
              variableCostAnnual: 17335.86,
              annualFee: 41055.36,
              monthlyFee: 3421.28,
              billingPortfolio: 'CORE',
              spvCode: 'FS',
            },
          ],
        },
      ],
    });
  });

  it('returns the selected month snapshot lines instead of recalculating the live register', async () => {
    const request = new NextRequest('https://example.test/api/spvs/FS?portfolio=CORE&month=2026-08');
    const response = await GET(request, { params: Promise.resolve({ code: 'FS' }) });
    const body = await response.json();

    expect(repository.getSpvMonthlyReport).toHaveBeenCalledWith('2026-08', 'contract-1');
    expect(repository.listSites).not.toHaveBeenCalled();
    expect(body.data).toMatchObject({
      code: 'FS',
      month: '2026-08',
      monthLabel: 'August 2026',
      source: 'billing-snapshots',
      sites: [{ id: 'snapshot-1', siteId: 'site-1', name: 'Fylde', monthlyFee: 3421.28 }],
      summary: { totalSites: 1, contractedSites: 1, totalMonthlyFee: 3421.28 },
    });
  });
});

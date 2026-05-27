import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getContractorOverview } from './contractor-overview';

const prismaMock = vi.hoisted(() => ({
  contractor: {
    findMany: vi.fn(),
  },
}));

vi.mock('./prisma', () => ({
  default: prismaMock,
}));

describe('contractor overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('summarises sites, capacity, and billing across contractors', async () => {
    prismaMock.contractor.findMany.mockResolvedValue([
      {
        id: 'contractor-1',
        code: 'A',
        name: 'Contractor A',
        slug: 'contractor-a',
        isActive: true,
        contracts: [
          {
            id: 'contract-1',
            name: 'A O&M',
            isActive: true,
            sites: [
              { id: 'site-1', systemSizeKwp: 1000, contractStatus: 'CONTRACTED', _count: { cmWorkEntries: 2 } },
              { id: 'site-2', systemSizeKwp: 500, contractStatus: 'AWAITING_PAC', _count: { cmWorkEntries: 1 } },
            ],
            billingSnapshots: [{ expectedAmount: 100 }, { expectedAmount: 50 }],
          },
        ],
      },
      {
        id: 'contractor-2',
        code: 'B',
        name: 'Contractor B',
        slug: 'contractor-b',
        isActive: true,
        contracts: [
          {
            id: 'contract-2',
            name: 'B O&M',
            isActive: true,
            sites: [{ id: 'site-3', systemSizeKwp: 2000, contractStatus: 'YES', _count: { cmWorkEntries: 1 } }],
            billingSnapshots: [{ expectedAmount: 200 }],
          },
        ],
      },
    ]);

    await expect(getContractorOverview()).resolves.toEqual({
      totals: {
        contractorCount: 2,
        contractCount: 2,
        siteCount: 3,
        contractedSiteCount: 2,
        totalCapacityKwp: 3500,
        contractedCapacityKwp: 3000,
        monthlyBillingAmount: 350,
        pendingCmWorkCount: 4,
      },
      contractors: [
        {
          id: 'contractor-1',
          code: 'A',
          name: 'Contractor A',
          slug: 'contractor-a',
          contractCount: 1,
          siteCount: 2,
          contractedSiteCount: 1,
          totalCapacityKwp: 1500,
          contractedCapacityKwp: 1000,
          monthlyBillingAmount: 150,
          pendingCmWorkCount: 3,
        },
        {
          id: 'contractor-2',
          code: 'B',
          name: 'Contractor B',
          slug: 'contractor-b',
          contractCount: 1,
          siteCount: 1,
          contractedSiteCount: 1,
          totalCapacityKwp: 2000,
          contractedCapacityKwp: 2000,
          monthlyBillingAmount: 200,
          pendingCmWorkCount: 1,
        },
      ],
    });

    expect(prismaMock.contractor.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      include: {
        contracts: {
          where: { isActive: true },
          include: {
            sites: {
              select: {
                id: true,
                systemSizeKwp: true,
                contractStatus: true,
                _count: { select: { cmWorkEntries: { where: { status: 'PENDING' } } } },
              },
            },
            billingSnapshots: {
              where: { source: 'APP_GENERATED', status: 'COMMITTED' },
              select: { expectedAmount: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  });
});

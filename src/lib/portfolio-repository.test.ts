import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeRateTiers, deleteSiteRecord, getSpvMonthlyReport, listSpvs, updateSiteRecord } from './portfolio-repository';

const prismaMock = vi.hoisted(() => ({
  auditLog: {
    create: vi.fn(),
  },
  billingSnapshot: {
    findMany: vi.fn(),
  },
  cmWorkEntry: {
    deleteMany: vi.fn(),
  },
  notionExternalMapping: {
    deleteMany: vi.fn(),
  },
  rateTier: {
    findMany: vi.fn(),
  },
  site: {
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  sPV: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const contractsMock = vi.hoisted(() => ({
  resolveContractId: vi.fn(),
  ensureDefaultContract: vi.fn(),
}));

vi.mock('./prisma', () => ({
  default: prismaMock,
}));

vi.mock('./contracts', () => contractsMock);

vi.mock('./billing-month-controls', () => ({
  applyBillingMonthControls: vi.fn(async (report) => report),
}));

describe('portfolio repository contract scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractsMock.resolveContractId.mockResolvedValue('contract-1');
  });

  it('filters active rate tiers by resolved contract', async () => {
    prismaMock.rateTier.findMany.mockResolvedValue([
      {
        id: 'tier-1',
        contractId: 'contract-1',
        tierName: '0-20MW',
        minCapacityMW: 0,
        maxCapacityMW: 20,
        ratePerKwp: 2,
      },
    ]);

    await expect(activeRateTiers('contract-code')).resolves.toEqual([
      {
        id: 'tier-1',
        contractId: 'contract-1',
        tierName: '0-20MW',
        minCapacityMW: 0,
        maxCapacityMW: 20,
        ratePerKwp: 2,
      },
    ]);

    expect(contractsMock.resolveContractId).toHaveBeenCalledWith('contract-code');
    expect(prismaMock.rateTier.findMany).toHaveBeenCalledWith({
      where: { contractId: 'contract-1', isActive: true },
      orderBy: { minCapacityMW: 'asc' },
    });
  });

  it('scopes SPV lists to the resolved contract', async () => {
    prismaMock.sPV.findMany.mockResolvedValue([]);

    await listSpvs('contract-code');

    expect(contractsMock.resolveContractId).toHaveBeenCalledWith('contract-code');
    expect(prismaMock.sPV.findMany).toHaveBeenCalledWith({
      where: { contractId: 'contract-1' },
      orderBy: { code: 'asc' },
    });
  });

  it('only deletes a site when it belongs to the resolved contract', async () => {
    const site = {
      id: 'site-1',
      contractId: 'contract-1',
      name: 'Example Site',
      systemSizeKwp: 1000,
      siteType: 'ROOFTOP',
      contractStatus: 'CONTRACTED',
      onboardDate: new Date('2026-05-01T00:00:00.000Z'),
      forecastPacDate: null,
      actualPacDate: null,
      pmCost: 100,
      pmDaysOnSite: 0,
      pmVisitsPerAnnum: 0,
      cctvCost: 50,
      cleaningCost: 50,
      additionalCostAnnual: 0,
      additionalCostAnnualComment: null,
      additionalCostMonthly: 0,
      additionalCostMonthlyComment: null,
      additionalCostMonthlyStartMonth: null,
      additionalCostMonthlyEndMonth: null,
      billingPortfolio: 'CORE',
      spvId: null,
      spv: null,
      sourceSheet: null,
      sourceRow: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const user = { id: 'user-1', email: 'user@example.com', name: 'User', role: 'ADMIN' } as const;
    prismaMock.site.findFirst.mockResolvedValue(site);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<void>) => callback(prismaMock));

    await expect(deleteSiteRecord('site-1', user, 'contract-code')).resolves.toBe(true);

    expect(prismaMock.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-1', contractId: 'contract-1' },
      include: { spv: true },
    });
    expect(prismaMock.site.delete).toHaveBeenCalledWith({ where: { id: 'site-1' } });
  });

  it('persists O&M acceptance without changing the site contract status', async () => {
    const site = {
      id: 'site-1',
      contractId: 'contract-1',
      name: 'Example Site',
      systemSizeKwp: 1000,
      siteType: 'ROOFTOP',
      contractStatus: 'CONTRACTED',
      acceptedByOm: false,
      onboardDate: new Date('2026-05-01T00:00:00.000Z'),
      forecastPacDate: null,
      actualPacDate: null,
      pmCost: 100,
      pmDaysOnSite: 0,
      pmVisitsPerAnnum: 0,
      cctvCost: 50,
      cleaningCost: 50,
      additionalCostAnnual: 0,
      additionalCostAnnualComment: null,
      additionalCostMonthly: 0,
      additionalCostMonthlyComment: null,
      additionalCostMonthlyStartMonth: null,
      additionalCostMonthlyEndMonth: null,
      billingPortfolio: 'CORE',
      spvId: null,
      spv: null,
      sourceSheet: null,
      sourceRow: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    let persisted = { ...site };
    const user = { id: 'user-1', email: 'user@example.com', name: 'User', role: 'ADMIN' } as const;
    prismaMock.site.findFirst.mockImplementation(async () => persisted);
    prismaMock.site.findMany.mockImplementation(async () => [persisted]);
    prismaMock.site.findUnique.mockResolvedValue({ contractId: 'contract-1', contract: { name: 'Example Contract' } });
    prismaMock.site.update.mockImplementation(async ({ data }: { data: typeof site }) => {
      persisted = { ...persisted, ...data };
      return persisted;
    });
    prismaMock.billingSnapshot.findMany.mockResolvedValue([]);
    prismaMock.rateTier.findMany.mockResolvedValue([]);

    const result = await updateSiteRecord('site-1', {
      name: site.name,
      systemSizeKwp: site.systemSizeKwp,
      siteType: 'Rooftop',
      contractStatus: 'Contracted',
      acceptedByOm: true,
      onboardDate: '2026-05-01',
      forecastPacDate: null,
      actualPacDate: null,
      pmCost: site.pmCost,
      pmDaysOnSite: site.pmDaysOnSite,
      pmVisitsPerAnnum: site.pmVisitsPerAnnum,
      cctvCost: site.cctvCost,
      cleaningCost: site.cleaningCost,
      additionalCostAnnual: 0,
      additionalCostAnnualComment: null,
      additionalCostMonthly: 0,
      additionalCostMonthlyComment: null,
      additionalCostMonthlyStartMonth: null,
      additionalCostMonthlyEndMonth: null,
      billingPortfolio: 'CORE',
      spvId: null,
    }, user, 'contract-code');

    expect(result).toMatchObject({
      acceptedByOm: true,
      contractStatus: 'Contracted',
    });
  });

  it('builds monthly reports from snapshots scoped to the resolved contract', async () => {
    const snapshots = [
      {
        id: 'snapshot-1',
        contractId: 'contract-1',
        source: 'APP_GENERATED',
        notionDatabaseId: 'APP_GENERATED_MONTHLY_BILLING',
        billingRunId: 'run-1',
        siteId: 'site-1',
        siteName: 'Contract 1 Site',
        spvCode: 'C1',
        spvName: 'Contract 1 SPV',
        month: '2026-05',
        billingEntry: 'Contract 1 Site 2026-05',
        systemSizeKwp: 1000,
        siteFixedCostsAnnual: 200,
        variableCostAnnual: 1800,
        expectedAmount: 100,
        invoicedAmount: null,
        sourcePayload: JSON.stringify({ site: { billingPortfolio: 'CORE' } }),
      },
      {
        id: 'snapshot-2',
        contractId: 'contract-2',
        source: 'APP_GENERATED',
        notionDatabaseId: 'APP_GENERATED_MONTHLY_BILLING',
        billingRunId: 'run-2',
        siteId: 'site-2',
        siteName: 'Contract 2 Site',
        spvCode: 'C2',
        spvName: 'Contract 2 SPV',
        month: '2026-05',
        billingEntry: 'Contract 2 Site 2026-05',
        systemSizeKwp: 2000,
        siteFixedCostsAnnual: 400,
        variableCostAnnual: 3600,
        expectedAmount: 200,
        invoicedAmount: null,
        sourcePayload: JSON.stringify({ site: { billingPortfolio: 'CORE' } }),
      },
    ];
    prismaMock.billingSnapshot.findMany.mockImplementation(async (args: { where?: { contractId?: string; month?: string }; distinct?: string[] }) => {
      const rows = snapshots.filter(
        (snapshot) =>
          (!args.where?.contractId || snapshot.contractId === args.where.contractId) &&
          (!args.where?.month || snapshot.month === args.where.month)
      );
      if (args.distinct?.includes('month')) {
        return Array.from(new Set(rows.map((snapshot) => snapshot.month))).map((month) => ({ month }));
      }
      return rows;
    });
    prismaMock.site.findMany.mockResolvedValue([]);

    const report = await getSpvMonthlyReport('2026-05', 'contract-code');

    expect(prismaMock.billingSnapshot.findMany).toHaveBeenNthCalledWith(1, {
      where: { contractId: 'contract-1', month: '2026-05' },
      orderBy: { billingEntry: 'asc' },
    });
    expect(prismaMock.billingSnapshot.findMany).toHaveBeenNthCalledWith(2, {
      where: { contractId: 'contract-1' },
      distinct: ['month'],
      select: { month: true },
      orderBy: { month: 'asc' },
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      spvCode: 'C1',
      monthlyFee: 100,
      billingSnapshotCount: 1,
    });
    expect(report.totals.monthlyFee).toBe(100);
  });
});

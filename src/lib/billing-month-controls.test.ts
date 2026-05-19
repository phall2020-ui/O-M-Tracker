import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBillingAdjustment, deleteBillingAdjustment, isBillingMonthLocked } from './billing-month-controls';

const prismaMock = vi.hoisted(() => ({
  auditLog: {
    create: vi.fn(),
  },
  billingAdjustment: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  billingMonthLock: {
    findUnique: vi.fn(),
  },
  site: {
    findFirst: vi.fn(),
  },
}));

const contractsMock = vi.hoisted(() => ({
  resolveContractId: vi.fn(),
  ensureDefaultContract: vi.fn(),
}));

vi.mock('./prisma', () => ({
  default: prismaMock,
}));

vi.mock('./contracts', () => contractsMock);

describe('billing month controls contract scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractsMock.resolveContractId.mockResolvedValue('contract-2');
  });

  it('checks month locks against the target contract', async () => {
    prismaMock.billingMonthLock.findUnique.mockResolvedValue({ id: 'lock-1' });

    await expect(isBillingMonthLocked('2026-05', 'contract-code')).resolves.toBe(true);

    expect(contractsMock.resolveContractId).toHaveBeenCalledWith('contract-code');
    expect(prismaMock.billingMonthLock.findUnique).toHaveBeenCalledWith({
      where: { contractId_month: { contractId: 'contract-2', month: '2026-05' } },
      select: { id: true },
    });
  });

  it('scopes site adjustment lookup to the resolved contract', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'User', role: 'ADMIN' } as const;
    prismaMock.billingMonthLock.findUnique.mockResolvedValue(null);
    prismaMock.site.findFirst.mockResolvedValue({
      id: 'site-1',
      contractId: 'contract-2',
      name: 'Site 1',
      spv: { code: 'OS2', name: 'Olympus Solar 2 Ltd' },
    });
    prismaMock.billingAdjustment.create.mockResolvedValue({
      id: 'adjustment-1',
      month: '2026-05',
      scope: 'SITE',
      allocationMode: 'KEEP_PORTFOLIO',
      description: 'Manual credit',
      amount: -25,
      category: null,
      siteId: 'site-1',
      site: { name: 'Site 1', spv: { code: 'OS2', name: 'Olympus Solar 2 Ltd' } },
      spvCode: 'OS2',
      spvName: 'Olympus Solar 2 Ltd',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    await createBillingAdjustment(
      {
        month: '2026-05',
        scope: 'SITE',
        description: 'Manual credit',
        amount: -25,
        siteId: 'site-1',
      },
      user
    );

    expect(prismaMock.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-1', contractId: 'contract-2' },
      include: { spv: true },
    });
    expect(prismaMock.billingAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractId: 'contract-2',
          siteId: 'site-1',
        }),
      })
    );
  });

  it('does not delete an adjustment outside the selected contract', async () => {
    const user = { id: 'user-1', email: 'user@example.com', name: 'User', role: 'ADMIN' } as const;
    prismaMock.billingAdjustment.findFirst.mockResolvedValue(null);
    prismaMock.billingAdjustment.findUnique.mockResolvedValue({
      id: 'adjustment-1',
      contractId: 'contract-1',
      month: '2026-05',
      scope: 'PORTFOLIO',
      allocationMode: 'KEEP_PORTFOLIO',
      description: 'Other contract adjustment',
      amount: 100,
      category: null,
      siteId: null,
      site: null,
      spvCode: null,
      spvName: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    await expect(deleteBillingAdjustment('adjustment-1', user, 'contract-code')).resolves.toBe(false);

    expect(contractsMock.resolveContractId).toHaveBeenCalledWith('contract-code');
    expect(prismaMock.billingAdjustment.findFirst).toHaveBeenCalledWith({
      where: { id: 'adjustment-1', contractId: 'contract-2' },
      include: { site: { include: { spv: true } } },
    });
    expect(prismaMock.billingAdjustment.delete).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DELETE',
          entityType: 'BillingAdjustment',
        }),
      })
    );
  });
});

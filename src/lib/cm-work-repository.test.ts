import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCmMonthlyUsage, getOfficialCmUsage } from './cm-work-repository';

const prismaMock = vi.hoisted(() => ({
  billingSnapshot: {
    findMany: vi.fn(),
  },
  cmWorkEntry: {
    findMany: vi.fn(),
  },
  site: {
    findMany: vi.fn(),
  },
}));

const contractsMock = vi.hoisted(() => ({
  resolveContractId: vi.fn(),
}));

vi.mock('./prisma', () => ({
  default: prismaMock,
}));

vi.mock('./contracts', () => contractsMock);

describe('CM work repository contract scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractsMock.resolveContractId.mockResolvedValue('contract-1');
    prismaMock.billingSnapshot.findMany.mockResolvedValue([]);
    prismaMock.cmWorkEntry.findMany.mockResolvedValue([]);
    prismaMock.site.findMany.mockResolvedValue([]);
  });

  it('scopes official CM usage capacity and entries to the resolved contract', async () => {
    await getOfficialCmUsage({ contractId: 'contract-code' });

    expect(contractsMock.resolveContractId).toHaveBeenCalledWith('contract-code');
    expect(prismaMock.billingSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contractId: 'contract-1' }),
      })
    );
    expect(prismaMock.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId: 'contract-1' },
      })
    );
    expect(prismaMock.cmWorkEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { site: { contractId: 'contract-1' } },
      })
    );
  });

  it('scopes monthly CM usage capacity and entries to the resolved contract', async () => {
    await getCmMonthlyUsage(2, 'contract-code');

    expect(contractsMock.resolveContractId).toHaveBeenCalledWith('contract-code');
    expect(prismaMock.billingSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contractId: 'contract-1' }),
      })
    );
    expect(prismaMock.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId: 'contract-1' },
      })
    );
    expect(prismaMock.cmWorkEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { site: { contractId: 'contract-1' } },
      })
    );
  });
});

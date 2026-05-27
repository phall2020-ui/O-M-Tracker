import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CONTRACT_CODE,
  DEFAULT_CONTRACT_NAME,
  ensureDefaultContract,
  listContractsForUser,
  normalizeContractCode,
  resolveContractId,
  resolveContractIdForUser,
  selectedContractWhere,
} from './contracts';

const prismaMock = vi.hoisted(() => ({
  contract: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  contractor: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('./prisma', () => ({
  default: prismaMock,
}));

describe('contract helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (operations: unknown[]) => {
      return Promise.all(operations);
    });
  });

  it('normalizes readable contract names into stable uppercase codes', () => {
    expect(normalizeContractCode('Clearsol O&M')).toBe('CLEARSOL_O_M');
    expect(normalizeContractCode('  Eden 2 Contract  ')).toBe('EDEN_2_CONTRACT');
  });

  it('builds a Prisma where clause for selected contract ids', () => {
    expect(selectedContractWhere('contract-1')).toEqual({ contractId: 'contract-1' });
  });

  it('throws for explicit invalid contract input instead of falling back to default', async () => {
    prismaMock.contract.findFirst.mockResolvedValue(null);

    await expect(resolveContractId('missing-contract')).rejects.toThrow('Contract not found: missing-contract');
    expect(prismaMock.contract.upsert).not.toHaveBeenCalled();
  });

  it('returns all active contracts for managers', async () => {
    prismaMock.contract.findMany.mockResolvedValue([
      { id: 'contract-1', code: 'A', name: 'A', description: null, notionSummaryPageId: null, notionBillingDatabaseId: null, isDefault: true, isActive: true, contractorId: 'contractor-1' },
      { id: 'contract-2', code: 'B', name: 'B', description: null, notionSummaryPageId: null, notionBillingDatabaseId: null, isDefault: false, isActive: true, contractorId: 'contractor-2' },
    ]);

    await expect(listContractsForUser({ id: 'manager-1', role: 'MANAGER', contractorIds: [] })).resolves.toHaveLength(2);

    expect(prismaMock.contract.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  });

  it('limits contractor contract lists to assigned contractor ids', async () => {
    prismaMock.contract.findMany.mockResolvedValue([
      { id: 'contract-1', code: 'A', name: 'A', description: null, notionSummaryPageId: null, notionBillingDatabaseId: null, isDefault: true, isActive: true, contractorId: 'contractor-1' },
    ]);

    await expect(listContractsForUser({ id: 'contractor-user', role: 'CONTRACTOR', contractorIds: ['contractor-1'] })).resolves.toHaveLength(1);

    expect(prismaMock.contract.findMany).toHaveBeenCalledWith({
      where: { isActive: true, contractorId: { in: ['contractor-1'] } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  });

  it('rejects contractor access to contracts outside their assigned contractors', async () => {
    prismaMock.contract.findFirst.mockResolvedValue(null);

    await expect(
      resolveContractIdForUser('contract-2', { id: 'contractor-user', role: 'CONTRACTOR', contractorIds: ['contractor-1'] })
    ).rejects.toThrow('Contract not found: contract-2');

    expect(prismaMock.contract.findFirst).toHaveBeenCalledWith({
      where: {
        isActive: true,
        contractorId: { in: ['contractor-1'] },
        OR: [{ id: 'contract-2' }, { code: 'CONTRACT_2' }],
      },
    });
  });

  it('upserts the Clearsol contract as the only default contract', async () => {
    const defaultContract = {
      id: 'default-contract',
      code: DEFAULT_CONTRACT_CODE,
      name: DEFAULT_CONTRACT_NAME,
      description: null,
      isDefault: true,
      isActive: true,
    };
    const defaultContractor = {
      id: 'default-contractor',
      code: DEFAULT_CONTRACT_CODE,
      name: DEFAULT_CONTRACT_NAME,
      slug: 'clearsol-o-m',
      isActive: true,
    };
    prismaMock.contract.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.contractor.upsert.mockResolvedValue(defaultContractor);
    prismaMock.contract.upsert.mockResolvedValue(defaultContract);

    await expect(ensureDefaultContract()).resolves.toBe(defaultContract);

    expect(prismaMock.contract.updateMany).toHaveBeenCalledWith({
      where: { code: { not: DEFAULT_CONTRACT_CODE }, isDefault: true },
      data: { isDefault: false },
    });
    expect(prismaMock.contract.upsert).toHaveBeenCalledWith({
      where: { code: DEFAULT_CONTRACT_CODE },
      update: { name: DEFAULT_CONTRACT_NAME, isDefault: true, isActive: true, contractorId: defaultContractor.id },
      create: {
        code: DEFAULT_CONTRACT_CODE,
        name: DEFAULT_CONTRACT_NAME,
        isDefault: true,
        isActive: true,
        contractorId: defaultContractor.id,
      },
    });
  });
});

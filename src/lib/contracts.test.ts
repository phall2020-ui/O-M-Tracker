import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONTRACT_CODE, DEFAULT_CONTRACT_NAME, ensureDefaultContract, normalizeContractCode, resolveContractId, selectedContractWhere } from './contracts';

const prismaMock = vi.hoisted(() => ({
  contract: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
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

  it('upserts the Clearsol contract as the only default contract', async () => {
    const defaultContract = {
      id: 'default-contract',
      code: DEFAULT_CONTRACT_CODE,
      name: DEFAULT_CONTRACT_NAME,
      description: null,
      isDefault: true,
      isActive: true,
    };
    prismaMock.contract.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.contract.upsert.mockResolvedValue(defaultContract);

    await expect(ensureDefaultContract()).resolves.toBe(defaultContract);

    expect(prismaMock.contract.updateMany).toHaveBeenCalledWith({
      where: { code: { not: DEFAULT_CONTRACT_CODE }, isDefault: true },
      data: { isDefault: false },
    });
    expect(prismaMock.contract.upsert).toHaveBeenCalledWith({
      where: { code: DEFAULT_CONTRACT_CODE },
      update: { name: DEFAULT_CONTRACT_NAME, isDefault: true, isActive: true },
      create: {
        code: DEFAULT_CONTRACT_CODE,
        name: DEFAULT_CONTRACT_NAME,
        isDefault: true,
        isActive: true,
      },
    });
  });
});

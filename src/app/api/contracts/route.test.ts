import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const { createContract, listContracts } = vi.hoisted(() => ({
  createContract: vi.fn(),
  listContracts: vi.fn(),
}));

vi.mock('@/lib/contracts', () => ({
  createContract,
  listContracts,
}));

vi.mock('@/lib/authz', () => ({
  requireRole: vi.fn(async () => ({ id: 'admin-id', role: 'ADMIN' })),
  authErrorResponse: (error: unknown) => error instanceof Response ? error : null,
}));

describe('contracts API', () => {
  beforeEach(() => {
    createContract.mockReset();
    listContracts.mockReset();
  });

  it('returns active contracts from the repository', async () => {
    listContracts.mockResolvedValue([
      {
        id: 'contract-1',
        code: 'CLEARSOL_O_M',
        name: 'Clearsol O&M',
        description: null,
        isDefault: true,
        isActive: true,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [
        {
          id: 'contract-1',
          code: 'CLEARSOL_O_M',
          name: 'Clearsol O&M',
          description: null,
          isDefault: true,
          isActive: true,
        },
      ],
    });
  });

  it('returns a 500 response when contracts cannot be listed', async () => {
    listContracts.mockRejectedValue(new Error('database unavailable'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: 'database unavailable',
    });
  });

  it('creates a contract for admins', async () => {
    createContract.mockResolvedValue({
      id: 'contract-2',
      code: 'NEW_CONTRACT',
      name: 'New Contract',
      description: null,
      notionSummaryPageId: null,
      notionBillingDatabaseId: null,
      isDefault: false,
      isActive: true,
    });

    const response = await POST(new Request('http://localhost/api/contracts', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Contract' }),
    }) as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createContract).toHaveBeenCalledWith({
      name: 'New Contract',
      description: undefined,
      notionSummaryPageId: undefined,
      notionBillingDatabaseId: undefined,
    });
    expect(body.data.code).toBe('NEW_CONTRACT');
  });

  it('returns conflict when a contract code already exists', async () => {
    createContract.mockRejectedValue(new Error('Contract code already exists'));

    const response = await POST(new Request('http://localhost/api/contracts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Existing Contract' }),
    }) as never);

    expect(response.status).toBe(409);
  });
});

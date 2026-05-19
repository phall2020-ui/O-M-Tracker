import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const { updateContract } = vi.hoisted(() => ({
  updateContract: vi.fn(),
}));

vi.mock('@/lib/contracts', () => ({
  updateContract,
}));

vi.mock('@/lib/authz', () => ({
  requireRole: vi.fn(async () => ({ id: 'admin-id', role: 'ADMIN' })),
  authErrorResponse: (error: unknown) => error instanceof Response ? error : null,
}));

describe('contract detail API', () => {
  beforeEach(() => {
    updateContract.mockReset();
  });

  it('updates a contract without deleting it', async () => {
    updateContract.mockResolvedValue({
      id: 'contract-2',
      code: 'NEW_CONTRACT',
      name: 'Renamed Contract',
      description: 'Updated',
      notionSummaryPageId: 'summary-page',
      notionBillingDatabaseId: 'billing-db',
      isDefault: false,
      isActive: true,
    });

    const response = await PATCH(
      new Request('http://localhost/api/contracts/contract-2', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Renamed Contract',
          description: 'Updated',
          notionSummaryPageId: 'summary-page',
          notionBillingDatabaseId: 'billing-db',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'contract-2' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateContract).toHaveBeenCalledWith('contract-2', {
      name: 'Renamed Contract',
      description: 'Updated',
      isActive: undefined,
      notionSummaryPageId: 'summary-page',
      notionBillingDatabaseId: 'billing-db',
    });
    expect(body.data.name).toBe('Renamed Contract');
  });

  it('returns 404 for unknown contracts', async () => {
    updateContract.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/contracts/missing', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Missing' }),
      }) as never,
      { params: Promise.resolve({ id: 'missing' }) }
    );

    expect(response.status).toBe(404);
  });
});

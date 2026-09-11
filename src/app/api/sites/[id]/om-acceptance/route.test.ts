import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { requireRole } from '@/lib/authz';

const repository = vi.hoisted(() => ({
  updateSiteOmAcceptance: vi.fn(),
}));

const contracts = vi.hoisted(() => ({
  resolveContractIdForUser: vi.fn(async () => 'contract-1'),
}));

vi.mock('@/lib/portfolio-repository', () => repository);
vi.mock('@/lib/contracts', () => contracts);
vi.mock('@/lib/authz', () => ({
  requireRole: vi.fn(async () => ({
    id: 'contractor-1',
    role: 'CONTRACTOR',
    contractorIds: ['contractor-scope'],
  })),
  authErrorResponse: (error: unknown) => (error instanceof Response ? error : null),
}));

function patchRequest(body: unknown, url = 'http://localhost/api/sites/site-1/om-acceptance') {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('O&M acceptance API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contracts.resolveContractIdForUser.mockResolvedValue('contract-1');
    vi.mocked(requireRole).mockResolvedValue({
      id: 'contractor-1',
      email: 'contractor@clearsol.co.uk',
      name: 'Contractor User',
      role: 'CONTRACTOR',
      contractorIds: ['contractor-scope'],
    });
  });

  it('lets a contractor accept a pipeline site without a full site update', async () => {
    repository.updateSiteOmAcceptance.mockResolvedValue({
      id: 'site-1',
      name: 'Greenacre Station',
      acceptedByOm: true,
      contractStatus: 'Contracted',
    });

    const response = await PATCH(patchRequest({ acceptedByOm: true }), {
      params: Promise.resolve({ id: 'site-1' }),
    });
    const body = await response.json();

    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'MANAGER', 'CONTRACTOR']);
    expect(repository.updateSiteOmAcceptance).toHaveBeenCalledWith(
      'site-1',
      true,
      expect.objectContaining({ role: 'CONTRACTOR' }),
      'contract-1'
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        id: 'site-1',
        name: 'Greenacre Station',
        acceptedByOm: true,
        contractStatus: 'Contracted',
      },
    });
  });

  it('rejects a non-boolean acceptance payload', async () => {
    const response = await PATCH(patchRequest({ acceptedByOm: 'yes' }), {
      params: Promise.resolve({ id: 'site-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, error: 'acceptedByOm must be a boolean' });
    expect(repository.updateSiteOmAcceptance).not.toHaveBeenCalled();
  });

  it('returns 404 when the site is outside the caller contract', async () => {
    repository.updateSiteOmAcceptance.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ acceptedByOm: true }), {
      params: Promise.resolve({ id: 'missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ success: false, error: 'Site not found' });
  });

  it('forbids roles that cannot accept pipeline sites', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const response = await PATCH(patchRequest({ acceptedByOm: true }), {
      params: Promise.resolve({ id: 'site-1' }),
    });

    expect(response.status).toBe(403);
    expect(repository.updateSiteOmAcceptance).not.toHaveBeenCalled();
  });
});

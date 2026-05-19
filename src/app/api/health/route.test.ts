import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { dbCount } = vi.hoisted(() => ({
  dbCount: vi.fn(),
}));

vi.mock('../../../lib/prisma', () => ({
  default: {
    sPV: {
      count: dbCount,
    },
  },
}));

describe('health API', () => {
  beforeEach(() => {
    dbCount.mockReset();
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  it('returns liveness without requiring database connectivity', async () => {
    const response = await GET(new Request('http://localhost/api/health'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      status: 'ok',
      checks: {
        app: true,
        databaseConfigured: false,
        authSecretConfigured: false,
      },
    });
    expect(dbCount).not.toHaveBeenCalled();
  });

  it('checks database connectivity when deep=true', async () => {
    process.env.DATABASE_URL = 'sqlserver://example';
    process.env.AUTH_SECRET = 'secret';
    dbCount.mockResolvedValue(1);

    const response = await GET(new Request('http://localhost/api/health?deep=true'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      status: 'ok',
      checks: {
        databaseConfigured: true,
        authSecretConfigured: true,
        databaseConnected: true,
      },
    });
  });

  it('returns degraded when deep database check fails', async () => {
    process.env.DATABASE_URL = 'sqlserver://example';
    dbCount.mockRejectedValue(new Error('connection failed'));

    const response = await GET(new Request('http://localhost/api/health?deep=true'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      status: 'degraded',
      checks: {
        databaseConnected: false,
      },
    });
  });
});

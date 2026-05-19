import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === 'true';
  const checks: Record<string, boolean> = {
    app: true,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authSecretConfigured: Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
  };

  if (deep) {
    try {
      await prisma.sPV.count();
      checks.databaseConnected = true;
    } catch (error) {
      checks.databaseConnected = false;
      console.error('Health check database connectivity failed:', error);
    }
  }

  const isHealthy = checks.app && (!deep || checks.databaseConnected === true);

  return NextResponse.json(
    {
      success: isHealthy,
      status: isHealthy ? 'ok' : 'degraded',
      checks,
      checkedAt: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 503 }
  );
}

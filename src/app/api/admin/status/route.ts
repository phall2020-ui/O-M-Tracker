import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { getEnvironmentReadiness } from '@/lib/admin-status';
import prisma from '@/lib/prisma';
import { resolveContractId } from '@/lib/contracts';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN']);
    const contractId = await resolveContractId(request.nextUrl.searchParams.get('contract'));
    const [siteCount, spvCount, cmPendingCount, billingSnapshotCount, lastSync] = await Promise.all([
      prisma.site.count({ where: { contractId } }),
      prisma.sPV.count({ where: { contractId } }),
      prisma.cmWorkEntry.count({ where: { status: 'PENDING', site: { contractId } } }),
      prisma.billingSnapshot.count({ where: { contractId } }),
      prisma.notionSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        environment: getEnvironmentReadiness(),
        counts: {
          sites: siteCount,
          spvs: spvCount,
          pendingCmWork: cmPendingCount,
          billingSnapshots: billingSnapshotCount,
        },
        lastSync: lastSync
          ? {
              id: lastSync.id,
              status: lastSync.status,
              trigger: lastSync.trigger,
              startedAt: lastSync.startedAt.toISOString(),
              completedAt: lastSync.completedAt?.toISOString() || null,
              error: lastSync.error,
            }
          : null,
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching admin status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch admin status' },
      { status: 500 }
    );
  }
}

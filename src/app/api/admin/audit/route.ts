import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { resolveContractId } from '@/lib/contracts';
import prisma from '@/lib/prisma';

function parseTake(value: string | null) {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 250);
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN']);
    const contractId = await resolveContractId(request.nextUrl.searchParams.get('contract'));
    const take = parseTake(request.nextUrl.searchParams.get('take'));

    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { site: { contractId } },
          { siteId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        site: {
          select: {
            id: true,
            name: true,
            spv: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        oldValues: log.oldValues,
        newValues: log.newValues,
        createdAt: log.createdAt.toISOString(),
        user: log.user,
        site: log.site
          ? {
              id: log.site.id,
              name: log.site.name,
              spvCode: log.site.spv?.code || null,
            }
          : null,
      })),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching audit log:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch audit log' },
      { status: 500 }
    );
  }
}

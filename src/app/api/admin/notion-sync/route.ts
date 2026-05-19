import { NextRequest, NextResponse } from 'next/server';
import { syncNotionSummary } from '@/lib/notion-integration';
import { authErrorResponse, requireRole } from '@/lib/authz';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    await requireRole(['ADMIN']);
    const runs = await prisma.notionSyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      data: runs.map((run) => ({
        ...run,
        payload: run.payload ? JSON.parse(run.payload) : null,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching Notion sync runs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Notion sync runs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN']);
    const body = await request.json().catch(() => ({}));
    const contractId = request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId;
    const run = await syncNotionSummary('manual', user, undefined, contractId);
    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error syncing Notion summary:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync Notion summary' },
      { status: 500 }
    );
  }
}

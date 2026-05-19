import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { publishNotionBillingSnapshots } from '@/lib/notion-billing-publisher';

function parseLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('limit must be a positive integer');
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'MANAGER']);
    const body = await request.json();
    const contractId = request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId;

    const result = await publishNotionBillingSnapshots({
      month: body.month,
      limit: parseLimit(body.limit),
      contractId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error syncing billing snapshots to Notion:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync billing snapshots to Notion' },
      { status: 500 }
    );
  }
}

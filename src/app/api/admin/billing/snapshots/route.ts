import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { listBillingSnapshots } from '@/lib/billing-repository';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'MANAGER']);
    const { searchParams } = new URL(request.url);
    const result = await listBillingSnapshots({
      month: searchParams.get('month'),
      source: searchParams.get('source'),
      status: searchParams.get('status'),
      contractId: searchParams.get('contract') ?? searchParams.get('contractId'),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error listing billing snapshots:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list billing snapshots' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { listBillingSnapshots } from '@/lib/billing-repository';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const { searchParams } = new URL(request.url);
    const contractId = await resolveContractIdForUser(searchParams.get('contract') ?? searchParams.get('contractId'), user);
    const result = await listBillingSnapshots({
      month: searchParams.get('month'),
      source: searchParams.get('source'),
      status: searchParams.get('status'),
      contractId,
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

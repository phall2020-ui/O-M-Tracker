import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { generateBillingSnapshots } from '@/lib/billing-repository';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const body = await request.json();
    const contractId = await resolveContractIdForUser(
      request.nextUrl.searchParams.get('contract') ??
      request.nextUrl.searchParams.get('contractId') ??
      body.contract ??
      body.contractId,
      user
    );
    const result = await generateBillingSnapshots({
      month: body.month,
      commit: body.commit === true,
      user,
      contractId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error generating billing snapshots:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate billing snapshots' },
      { status: 500 }
    );
  }
}

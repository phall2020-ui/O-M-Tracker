import { NextRequest, NextResponse } from 'next/server';
import { reviewCmWork, serializeCmWork } from '@/lib/cm-work-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const { id } = await params;
    const body = await request.json();
    const status = body.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    const contractId = await resolveContractIdForUser(request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId, user);
    const entry = await reviewCmWork(id, status, body.reviewNote || null, user, contractId);

    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'CM work entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: serializeCmWork(entry),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error reviewing CM work:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to review CM work' },
      { status: 500 }
    );
  }
}

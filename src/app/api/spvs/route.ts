import { NextRequest, NextResponse } from 'next/server';
import { listSpvs } from '@/lib/portfolio-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { ALL_ROLES } from '@/lib/permissions';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(ALL_ROLES);
    const contractId = await resolveContractIdForUser(request.nextUrl.searchParams.get('contract'), user);
    const spvs = await listSpvs(contractId);
    
    return NextResponse.json({
      success: true,
      data: spvs,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching SPVs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SPVs' },
      { status: 500 }
    );
  }
}

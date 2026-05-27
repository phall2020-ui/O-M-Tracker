import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioSummary } from '@/lib/portfolio-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { ALL_ROLES } from '@/lib/permissions';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(ALL_ROLES);
    const contractId = await resolveContractIdForUser(request.nextUrl.searchParams.get('contract'), user);
    const summary = await getPortfolioSummary({ contractId });
    
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error calculating portfolio summary:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate portfolio summary' },
      { status: 500 }
    );
  }
}

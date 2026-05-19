import { NextRequest, NextResponse } from 'next/server';
import { getSpvMonthlyReport } from '@/lib/portfolio-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { ALL_ROLES } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    await requireRole(ALL_ROLES);
    const month = request.nextUrl.searchParams.get('month');
    const contractId = request.nextUrl.searchParams.get('contract') ?? request.nextUrl.searchParams.get('contractId');
    const report = await getSpvMonthlyReport(month, contractId);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching monthly SPV report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch monthly SPV report' },
      { status: 500 }
    );
  }
}

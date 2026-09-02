import { NextRequest, NextResponse } from 'next/server';
import { getSpvMonthlyReport } from '@/lib/portfolio-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { ALL_ROLES } from '@/lib/permissions';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const user = await requireRole(ALL_ROLES);
    const { code } = await params;
    const contractId = await resolveContractIdForUser(request.nextUrl.searchParams.get('contract'), user);
    const month = request.nextUrl.searchParams.get('month');
    const requestedPortfolio = request.nextUrl.searchParams.get('portfolio');
    const billingPortfolio = requestedPortfolio === 'EDEN' || requestedPortfolio === 'CORE' ? requestedPortfolio : null;
    const report = await getSpvMonthlyReport(month, contractId);
    const row = report.rows.find((item) => (
      item.spvCode === code &&
      (!billingPortfolio || (item.billingPortfolio || 'CORE') === billingPortfolio)
    ));

    if (!row) {
      return NextResponse.json(
        { success: false, error: 'SPV not found for the selected billing month' },
        { status: 404 }
      );
    }
    
    const response = {
      code: row.spvCode,
      name: row.spvName,
      billingPortfolio: row.billingPortfolio || 'CORE',
      month: report.month,
      monthLabel: report.monthLabel,
      source: report.source || 'calculated-sites',
      sites: row.siteLines || [],
      summary: {
        totalSites: row.siteCount,
        contractedSites: row.contractedSiteCount,
        totalCapacityKwp: row.totalCapacityKwp,
        contractedCapacityKwp: row.contractedCapacityKwp,
        totalMonthlyFee: row.monthlyFee,
        totalAnnualFee: row.annualFee,
        adjustmentAmount: row.adjustmentAmount || 0,
        adjustedMonthlyFee: row.adjustedMonthlyFee ?? row.monthlyFee,
      },
    };
    
    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching SPV details:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SPV details' },
      { status: 500 }
    );
  }
}

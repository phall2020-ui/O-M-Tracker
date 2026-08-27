import { NextRequest, NextResponse } from 'next/server';
import { listSites, listSpvs } from '@/lib/portfolio-repository';
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
    const spv = (await listSpvs(contractId)).find((item) => item.code === code);
    
    if (!spv) {
      return NextResponse.json(
        { success: false, error: 'SPV not found' },
        { status: 404 }
      );
    }
    
    // An SPV can hold both Core and Eden sites while they share a contract. Scope the invoice to
    // the billing portfolio the caller opened so it ties back to the /spvs row it came from.
    const requestedPortfolio = request.nextUrl.searchParams.get('portfolio');
    const billingPortfolio = requestedPortfolio === 'EDEN' || requestedPortfolio === 'CORE' ? requestedPortfolio : null;
    const allSpvSites = await listSites({ spvCode: code, contractId });
    const sitesWithCalcs = billingPortfolio
      ? allSpvSites.filter((site) => site.billingPortfolio === billingPortfolio)
      : allSpvSites;
    
    const contractedSites = sitesWithCalcs.filter(s => s.contractStatus === 'Contracted' || s.contractStatus === 'Yes');
    const totalMonthlyFee = contractedSites.reduce((sum, s) => sum + s.monthlyFee, 0);
    
    const response = {
      code: spv.code,
      name: spv.name,
      billingPortfolio,
      sites: sitesWithCalcs,
      summary: {
        totalSites: sitesWithCalcs.length,
        contractedSites: contractedSites.length,
        totalCapacityKwp: sitesWithCalcs.reduce((sum, s) => sum + s.systemSizeKwp, 0),
        contractedCapacityKwp: contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0),
        totalMonthlyFee,
        totalAnnualFee: totalMonthlyFee * 12,
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

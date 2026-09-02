import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioSummary, getSpvSummaries, listSites } from '@/lib/portfolio-repository';
import { getCmMonthlyUsage, getOfficialCmUsage } from '@/lib/cm-work-repository';
import { buildCapacityHistory, CapacityHistorySource } from '@/lib/dashboard-data';
import { currentMonth } from '@/lib/month-periods';
import { listBillingSnapshots } from '@/lib/billing-repository';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { ALL_ROLES } from '@/lib/permissions';
import { resolveContractIdForUser } from '@/lib/contracts';
import { isAcceptedContractedSite } from '@/lib/calculations';

function authoritativeCapacitySources(
  summaries: Array<{ month: string; source: string; status: string; snapshotCount: number; systemSizeKwp: number }>
): CapacityHistorySource[] {
  const byMonth = new Map<string, typeof summaries>();
  for (const summary of summaries) {
    byMonth.set(summary.month, [...(byMonth.get(summary.month) || []), summary]);
  }

  return Array.from(byMonth.entries()).map(([month, monthSummaries]) => {
    const committedAppGenerated = monthSummaries.filter(
      (summary) => summary.source === 'APP_GENERATED' && summary.status === 'COMMITTED'
    );
    const selected = committedAppGenerated.length > 0 ? committedAppGenerated : monthSummaries;
    return {
      month,
      systemSizeKwp: selected.reduce((sum, summary) => sum + summary.systemSizeKwp, 0),
      snapshotCount: selected.reduce((sum, summary) => sum + summary.snapshotCount, 0),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(ALL_ROLES);
    const contractId = await resolveContractIdForUser(request.nextUrl.searchParams.get('contract'), user);
    const [sitesWithCalcs, summary, spvSummaries, cmUsage, cmMonthlyUsage, billingSnapshots] = await Promise.all([
      listSites({ contractId }),
      getPortfolioSummary({ contractId }),
      getSpvSummaries({ contractId }),
      getOfficialCmUsage({ contractId }),
      getCmMonthlyUsage(12, contractId),
      listBillingSnapshots({ contractId }),
    ]);
    const contractedSites = sitesWithCalcs.filter(isAcceptedContractedSite);
    const capacityHistory = buildCapacityHistory(authoritativeCapacitySources(billingSnapshots.summaries), currentMonth(), 12);
    
    // Capacity by SPV
    const capacityBySpv = spvSummaries
      .map((spv) => ({
        spv: spv.code,
        capacity: spv.totalCapacityKwp,
        contracted: spv.contractedCapacityKwp,
      }))
      .sort((a, b) => b.contracted - a.contracted)
      .slice(0, 8); // Top 8 SPVs
    
    // Top sites by monthly fee
    const topSites = contractedSites
      .sort((a, b) => b.monthlyFee - a.monthlyFee)
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        name: s.name,
        spv: s.spvCode,
        capacity: s.systemSizeKwp,
        monthlyFee: s.monthlyFee,
      }));
    
    // Site type breakdown
    const siteTypeBreakdown = {
      rooftop: sitesWithCalcs.filter(s => s.siteType === 'Rooftop').length,
      groundMount: sitesWithCalcs.filter(s => s.siteType === 'Ground Mount').length,
    };
    
    return NextResponse.json({
      success: true,
      data: {
        summary,
        capacityHistory,
        capacityBySpv,
        topSites,
        siteTypeBreakdown,
        contractStatus: {
          contracted: contractedSites.length,
          nonContracted: sitesWithCalcs.length - contractedSites.length,
        },
        cmUsage,
        cmMonthlyUsage,
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}

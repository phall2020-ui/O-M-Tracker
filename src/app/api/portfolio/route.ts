import { NextResponse } from 'next/server';
import { getSites, getSpvs } from '@/lib/db';
import { calculatePortfolioSummary } from '@/lib/calculations';
import { checkSites, summariseIssues } from '@/lib/data-quality';

export async function GET() {
  try {
    const sites = getSites();
    const spvs = getSpvs();
    const summary = calculatePortfolioSummary(sites);
    const issues = checkSites(sites, spvs);
    return NextResponse.json({
      success: true,
      data: { ...summary, issues, issueCounts: summariseIssues(issues) },
    });
  } catch (error) {
    console.error('Error calculating portfolio summary:', error);
    return NextResponse.json({ success: false, error: 'Failed to calculate portfolio summary' }, { status: 500 });
  }
}

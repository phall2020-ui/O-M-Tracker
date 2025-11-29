import { NextResponse } from 'next/server';
import { getSites } from '@/lib/db';
import { calculatePortfolioSummary } from '@/lib/calculations';

export async function GET() {
  try {
    const sites = getSites();
    const summary = calculatePortfolioSummary(sites);
    
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error calculating portfolio summary:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate portfolio summary' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getSites, getCMDaysUsage, upsertCMDaysUsage } from '@/lib/db';
import { calculateCMDaysTracking } from '@/lib/calculations';

export async function GET() {
  try {
    const sites = getSites();
    const cmDaysUsage = getCMDaysUsage();
    const tracking = calculateCMDaysTracking(sites, cmDaysUsage);
    
    return NextResponse.json({
      success: true,
      data: tracking,
    });
  } catch (error) {
    console.error('Error fetching CM days tracking:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch CM days tracking' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yearMonth, daysUsed, notes } = body;
    
    // Validate required fields
    if (!yearMonth || daysUsed === undefined) {
      return NextResponse.json(
        { success: false, error: 'yearMonth and daysUsed are required' },
        { status: 400 }
      );
    }
    
    // Validate yearMonth format (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json(
        { success: false, error: 'yearMonth must be in YYYY-MM format' },
        { status: 400 }
      );
    }
    
    // Validate daysUsed is a non-negative number
    if (typeof daysUsed !== 'number' || daysUsed < 0) {
      return NextResponse.json(
        { success: false, error: 'daysUsed must be a non-negative number' },
        { status: 400 }
      );
    }
    
    const usage = upsertCMDaysUsage(yearMonth, daysUsed, notes || null);
    
    // Return updated tracking data
    const sites = getSites();
    const cmDaysUsage = getCMDaysUsage();
    const tracking = calculateCMDaysTracking(sites, cmDaysUsage);
    
    return NextResponse.json({
      success: true,
      data: {
        usage,
        tracking,
      },
    });
  } catch (error) {
    console.error('Error updating CM days usage:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update CM days usage' },
      { status: 500 }
    );
  }
}

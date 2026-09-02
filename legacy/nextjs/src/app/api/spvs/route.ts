import { NextResponse } from 'next/server';
import { getSpvs } from '@/lib/db';

export async function GET() {
  try {
    const spvs = getSpvs();
    
    return NextResponse.json({
      success: true,
      data: spvs,
    });
  } catch (error) {
    console.error('Error fetching SPVs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SPVs' },
      { status: 500 }
    );
  }
}

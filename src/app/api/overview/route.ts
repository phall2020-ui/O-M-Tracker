import { NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import { getContractorOverview } from '@/lib/contractor-overview';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'MANAGER']);
    return NextResponse.json({ success: true, data: await getContractorOverview() });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching contractor overview:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch contractor overview' },
      { status: 500 }
    );
  }
}

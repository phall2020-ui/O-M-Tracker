import { NextRequest, NextResponse } from 'next/server';
import {
  createCmWork,
  getCmMonthlyUsage,
  getOfficialCmUsage,
  listCmWork,
  serializeCmWork,
} from '@/lib/cm-work-repository';
import { authErrorResponse, requireRole, requireUser } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const contractId = request.nextUrl.searchParams.get('contract');
    const entries = await listCmWork(status, contractId);

    return NextResponse.json({
      success: true,
      data: {
        entries: entries.map(serializeCmWork),
        summary: await getOfficialCmUsage({ contractId }),
        monthlyUsage: await getCmMonthlyUsage(12, contractId),
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error fetching CM work:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch CM work' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'CONTRACTOR']);
    const body = await request.json();
    const contractId = request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId;
    const entry = await createCmWork({ ...body, contractId }, user);

    return NextResponse.json({
      success: true,
      data: serializeCmWork(entry),
    }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error creating CM work:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create CM work' },
      { status: 400 }
    );
  }
}

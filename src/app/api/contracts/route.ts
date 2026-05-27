import { NextRequest, NextResponse } from 'next/server';
import { createContract, listContractsForUser } from '@/lib/contracts';
import { authErrorResponse, requireRole, requireUser } from '@/lib/authz';

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ success: true, data: await listContractsForUser(user) });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error listing contracts:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list contracts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['ADMIN']);
    const body = await request.json();
    const contract = await createContract({
      name: body.name,
      description: body.description,
      notionSummaryPageId: body.notionSummaryPageId,
      notionBillingDatabaseId: body.notionBillingDatabaseId,
    });

    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : 'Failed to create contract';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Contract code already exists' ? 409 : 400 }
    );
  }
}

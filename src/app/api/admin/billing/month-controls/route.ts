import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole } from '@/lib/authz';
import {
  createBillingAdjustment,
  deleteBillingAdjustment,
  getBillingMonthControls,
  lockBillingMonth,
  unlockBillingMonth,
} from '@/lib/billing-month-controls';
import { resolveContractIdForUser } from '@/lib/contracts';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const month = request.nextUrl.searchParams.get('month');
    const contractId = await resolveContractIdForUser(
      request.nextUrl.searchParams.get('contract') ?? request.nextUrl.searchParams.get('contractId'),
      user
    );
    const controls = await getBillingMonthControls(month, contractId);
    return NextResponse.json({ success: true, data: controls });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch month controls' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const body = await request.json();
    const contractId = await resolveContractIdForUser(
      request.nextUrl.searchParams.get('contract') ??
      request.nextUrl.searchParams.get('contractId') ??
      body.contract ??
      body.contractId ??
      body.adjustment?.contractId,
      user
    );

    if (body.action === 'lock') {
      await lockBillingMonth(body.month, body.note, user, contractId);
    } else if (body.action === 'unlock') {
      await unlockBillingMonth(body.month, user, contractId);
    } else if (body.action === 'add-adjustment') {
      await createBillingAdjustment({ ...body.adjustment, contractId }, user);
    } else if (body.action === 'delete-adjustment') {
      await deleteBillingAdjustment(body.id, user, contractId);
    } else {
      return NextResponse.json({ success: false, error: 'Unknown month-control action' }, { status: 400 });
    }

    const controls = await getBillingMonthControls(body.month || body.adjustment?.month, contractId);
    return NextResponse.json({ success: true, data: controls });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update month controls' },
      { status: 500 }
    );
  }
}

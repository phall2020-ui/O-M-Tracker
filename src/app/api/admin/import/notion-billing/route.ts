import { NextRequest, NextResponse } from 'next/server';
import { previewOrImportNotionBillingSnapshots } from '@/lib/notion-integration';
import { authErrorResponse, requireRole } from '@/lib/authz';
import prisma from '@/lib/prisma';
import { resolveContractIdForUser } from '@/lib/contracts';

const DEFAULT_BILLING_DATABASE_ID = '39212e37-c38b-4c79-b1cd-8e54c976f7ea';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['ADMIN']);
    const body = await request.json();
    const contractId = await resolveContractIdForUser(request.nextUrl.searchParams.get('contract') ?? body.contract ?? body.contractId, user);
    const resolvedContractId = contractId;
    const contract = await prisma.contract.findUnique({
      where: { id: resolvedContractId },
      select: { notionBillingDatabaseId: true },
    });
    const databaseId =
      body.databaseId ||
      contract?.notionBillingDatabaseId ||
      process.env.NOTION_BILLING_DATABASE_ID ||
      DEFAULT_BILLING_DATABASE_ID;

    const report = await previewOrImportNotionBillingSnapshots(databaseId, body.commit === true, user, contractId);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Error importing Notion billing snapshots:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to import Notion billing snapshots' },
      { status: 500 }
    );
  }
}

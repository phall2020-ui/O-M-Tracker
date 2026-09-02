import { NextRequest, NextResponse } from 'next/server';
import { getAuditLog } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tableName = searchParams.get('table') || undefined;
  const action = searchParams.get('action') || undefined;
  const limit = Number(searchParams.get('limit') || 250);
  return NextResponse.json({ success: true, data: getAuditLog(limit, tableName, action) });
}

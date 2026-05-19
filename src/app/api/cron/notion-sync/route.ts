import { NextRequest, NextResponse } from 'next/server';
import { syncNotionSummary } from '@/lib/notion-integration';

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const suppliedSecret = request.headers.get('x-cron-secret');

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const run = await syncNotionSummary('daily-cron', null);
    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    console.error('Error running scheduled Notion sync:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync Notion summary' },
      { status: 500 }
    );
  }
}

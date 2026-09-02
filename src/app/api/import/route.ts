import { NextRequest, NextResponse } from 'next/server';
import { importSites, getSpvsByCode } from '@/lib/db';
import { parseWorkbook } from '@/lib/importer';
import { ValidationError } from '@/lib/validation';

async function readPreview(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return { error: 'No file provided' as const };
  const preview = parseWorkbook(await file.arrayBuffer(), getSpvsByCode());
  return { preview };
}

export async function PUT(request: NextRequest) {
  try {
    const result = await readPreview(request);
    if ('error' in result && result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result.preview });
  } catch (error) {
    console.error('Error previewing import:', error);
    return NextResponse.json({ success: false, error: 'Failed to read spreadsheet' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await readPreview(request);
    if ('error' in result && result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    const preview = result.preview!;
    if (preview.fileErrors.length) {
      return NextResponse.json({ success: false, error: preview.fileErrors.join('; ') }, { status: 400 });
    }
    if (!preview.validSites.length) {
      return NextResponse.json({ success: false, error: 'No valid sites found in spreadsheet' }, { status: 400 });
    }
    const imported = importSites(preview.validSites);
    return NextResponse.json({
      success: true,
      data: {
        count: imported.length,
        message: `Successfully imported ${imported.length} sites`,
        skippedErrors: preview.rows.filter((r) => r.status === 'Error').length,
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.errors.join('; ') }, { status: 400 });
    }
    console.error('Error importing sites:', error);
    return NextResponse.json({ success: false, error: 'Failed to import sites' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { importSites, getSpvByCode } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    // Get Portfolio Tracker sheet
    const sheetName = 'Portfolio Tracker';
    const sheet = workbook.Sheets[sheetName];
    
    if (!sheet) {
      return NextResponse.json(
        { success: false, error: 'Portfolio Tracker sheet not found' },
        { status: 400 }
      );
    }
    
    const sites: Parameters<typeof importSites>[0] = [];
    
    // Parse rows 5-68 (Excel rows, 0-indexed in code is 4-67)
    for (let row = 5; row <= 68; row++) {
      const siteName = sheet[`C${row}`]?.v;
      if (!siteName || typeof siteName !== 'string') continue;
      
      const systemSize = parseFloat(sheet[`D${row}`]?.v) || 0;
      const contractValue = sheet[`E${row}`]?.v;
      const onboardDateRaw = sheet[`F${row}`]?.v;
      const pmCost = parseFloat(sheet[`G${row}`]?.v) || 0;
      const cctvCost = parseFloat(sheet[`H${row}`]?.v) || 0;
      const cleaningCost = parseFloat(sheet[`I${row}`]?.v) || 0;
      const spvCodeRaw = sheet[`V${row}`]?.v;
      
      // Parse onboard date
      let onboardDate: string | null = null;
      if (onboardDateRaw) {
        if (typeof onboardDateRaw === 'number') {
          // Excel serial date
          const date = XLSX.SSF.parse_date_code(onboardDateRaw);
          onboardDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        } else if (typeof onboardDateRaw === 'string') {
          onboardDate = onboardDateRaw;
        }
      }
      
      // Determine contract status
      const contractStatus = contractValue === 'Yes' ? 'Yes' : 'No';
      
      // Get SPV
      const spvCode = typeof spvCodeRaw === 'string' ? spvCodeRaw : null;
      const spv = spvCode ? getSpvByCode(spvCode) : null;
      
      sites.push({
        name: siteName,
        systemSizeKwp: systemSize,
        siteType: 'Rooftop',
        contractStatus: contractStatus as 'Yes' | 'No',
        onboardDate,
        pmCost,
        cctvCost,
        cleaningCost,
        spvId: spv?.id || null,
        spvCode: spvCode,
        sourceSheet: sheetName,
        sourceRow: row,
      });
    }
    
    if (sites.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid sites found in spreadsheet' },
        { status: 400 }
      );
    }
    
    const importedSites = importSites(sites);
    
    return NextResponse.json({
      success: true,
      data: {
        count: importedSites.length,
        message: `Successfully imported ${importedSites.length} sites`,
      },
    });
  } catch (error) {
    console.error('Error importing sites:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import sites' },
      { status: 500 }
    );
  }
}

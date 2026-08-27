import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL || ''),
});

const CONTRACTOR_CODE = 'TEST_CONSULTING';
const CONTRACTOR_NAME = 'TEST Consulting';
const CONTRACTOR_SLUG = 'test-consulting';
const CONTRACT_CODE = 'TEST_CONSULTING_O_M';
const CONTRACT_NAME = 'TEST Consulting O&M';

const exampleSpvs = [
  { code: 'TC1', name: 'TEST Consulting SPV 1 Ltd' },
  { code: 'TC2', name: 'TEST Consulting SPV 2 Ltd' },
];

const exampleSites = [
  {
    name: 'Eastgate Logistics Hub',
    systemSizeKwp: 1450,
    siteType: 'ROOFTOP',
    contractStatus: 'YES',
    onboardDate: new Date('2026-01-15'),
    pmCost: 400,
    cctvCost: 150,
    cleaningCost: 200,
    spvCode: 'TC1',
  },
  {
    name: 'Westbridge Retail Park',
    systemSizeKwp: 820,
    siteType: 'ROOFTOP',
    contractStatus: 'YES',
    onboardDate: new Date('2026-03-01'),
    pmCost: 300,
    cctvCost: 100,
    cleaningCost: 150,
    spvCode: 'TC2',
  },
  {
    name: 'Southfield Distribution Centre',
    systemSizeKwp: 2100,
    siteType: 'ROOFTOP',
    contractStatus: 'NO',
    pmCost: 480,
    cctvCost: 180,
    cleaningCost: 260,
    spvCode: 'TC1',
  },
  {
    name: 'Boston',
    systemSizeKwp: 1600,
    siteType: 'ROOFTOP',
    contractStatus: 'AWAITING_CONTRACT',
    pmCost: 2550,
    pmDaysOnSite: 3,
    cctvCost: 0,
    cleaningCost: 0,
  },
];

// Standing rate for all sites. The superseded capacity bands are no longer seeded;
// existing rows are retired by prisma/migrate-standard-rate.ts.
const defaultRateTiers = [
  { tierName: 'Standard', minCapacityMW: 0, maxCapacityMW: null, ratePerKwp: 1.7 },
];

async function main() {
  console.log('🌱 Seeding TEST Consulting contractor...');

  const contractor = await prisma.contractor.upsert({
    where: { code: CONTRACTOR_CODE },
    update: { name: CONTRACTOR_NAME, slug: CONTRACTOR_SLUG, isActive: true },
    create: { code: CONTRACTOR_CODE, name: CONTRACTOR_NAME, slug: CONTRACTOR_SLUG, isActive: true },
  });

  const contract = await prisma.contract.upsert({
    where: { code: CONTRACT_CODE },
    update: { name: CONTRACT_NAME, isDefault: false, isActive: true, contractorId: contractor.id },
    create: { code: CONTRACT_CODE, name: CONTRACT_NAME, isDefault: false, isActive: true, contractorId: contractor.id },
  });
  console.log(`✅ Contractor + contract ready (${contract.code})`);

  // O&M contractor login scoped to TEST Consulting only
  const password = await bcrypt.hash('testconsulting123', 10);
  const omUser = await prisma.user.upsert({
    where: { email: 'om@testconsulting.co.uk' },
    update: { name: 'TEST Consulting O&M', role: 'CONTRACTOR' },
    create: {
      email: 'om@testconsulting.co.uk',
      name: 'TEST Consulting O&M',
      password,
      role: 'CONTRACTOR',
    },
  });
  await prisma.userContractorAccess.upsert({
    where: { userId_contractorId: { userId: omUser.id, contractorId: contractor.id } },
    update: {},
    create: { userId: omUser.id, contractorId: contractor.id },
  });
  // Safety: strip any access this user might have to other contractors
  await prisma.userContractorAccess.deleteMany({
    where: { userId: omUser.id, contractorId: { not: contractor.id } },
  });
  console.log('✅ O&M login created: om@testconsulting.co.uk (CONTRACTOR role, TEST Consulting only)');

  for (const spv of exampleSpvs) {
    await prisma.sPV.upsert({
      where: { contractId_code: { contractId: contract.id, code: spv.code } },
      update: { name: spv.name },
      create: { ...spv, contractId: contract.id },
    });
  }
  console.log(`✅ Created ${exampleSpvs.length} SPVs`);

  for (const tier of defaultRateTiers) {
    const existing = await prisma.rateTier.findFirst({
      where: { contractId: contract.id, tierName: tier.tierName, isActive: true },
    });
    if (!existing) {
      await prisma.rateTier.create({ data: { ...tier, contractId: contract.id } });
    }
  }
  console.log(`✅ Rate tiers ready`);

  let sitesCreated = 0;
  for (const site of exampleSites) {
    const spv = site.spvCode
      ? await prisma.sPV.findUnique({
          where: { contractId_code: { contractId: contract.id, code: site.spvCode } },
        })
      : null;

    const existing = await prisma.site.findFirst({
      where: { name: site.name, contractId: contract.id },
    });
    if (existing) continue;

    await prisma.site.create({
      data: {
        contractId: contract.id,
        name: site.name,
        systemSizeKwp: site.systemSizeKwp,
        siteType: site.siteType,
        contractStatus: site.contractStatus,
        onboardDate: site.onboardDate || null,
        pmCost: site.pmCost,
        pmDaysOnSite: site.pmDaysOnSite || 0,
        pmVisitsPerAnnum: 0,
        cctvCost: site.cctvCost,
        cleaningCost: site.cleaningCost,
        additionalCostAnnual: 0,
        additionalCostMonthly: 0,
        spvId: spv?.id || null,
      },
    });
    sitesCreated++;
  }
  console.log(`✅ Created ${sitesCreated} example sites`);

  console.log('🎉 TEST Consulting seed completed!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

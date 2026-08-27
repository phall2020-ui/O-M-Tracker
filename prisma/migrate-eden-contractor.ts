/**
 * Moves the Eden sites out of the Clearsol O&M contract and into their own Eden contractor
 * and contract, so Eden is a separate section of the portal rather than a billing flag inside
 * Clearsol.
 *
 * What moves with the sites:
 *   - the site rows themselves (contractId)
 *   - a parallel SPV row per SPV the Eden sites use (SPV code is unique per contract)
 *   - historical BillingSnapshot and BillingAdjustment rows for those sites, so past months
 *     stop appearing under Clearsol
 *   - CM work entries follow automatically (CmWorkEntry keys on siteId only)
 *
 * Sites keep billingPortfolio = 'EDEN'. That flag is what makes the move reversible and what
 * historical snapshot payloads already record.
 *
 *   npx tsx prisma/migrate-eden-contractor.ts            # dry run, prints the plan
 *   npx tsx prisma/migrate-eden-contractor.ts --apply    # writes
 *   npx tsx prisma/migrate-eden-contractor.ts --revert --apply
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL || ''),
});

const SOURCE_CONTRACT_CODE = 'CLEARSOL_O_M';

const EDEN_CONTRACTOR_CODE = 'EDEN';
const EDEN_CONTRACTOR_NAME = 'Eden';
const EDEN_CONTRACTOR_SLUG = 'eden';
const EDEN_CONTRACT_CODE = 'EDEN_O_M';
const EDEN_CONTRACT_NAME = 'Eden O&M';

const STANDARD_TIER = { tierName: 'Standard', minCapacityMW: 0, maxCapacityMW: null, ratePerKwp: 1.7 };

const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');

async function requireContract(code: string) {
  const contract = await prisma.contract.findUnique({ where: { code }, select: { id: true, code: true, name: true } });
  if (!contract) throw new Error(`Contract ${code} not found`);
  return contract;
}

async function ensureEdenContract() {
  const contractor = await prisma.contractor.upsert({
    where: { code: EDEN_CONTRACTOR_CODE },
    update: { name: EDEN_CONTRACTOR_NAME, slug: EDEN_CONTRACTOR_SLUG, isActive: true },
    create: { code: EDEN_CONTRACTOR_CODE, name: EDEN_CONTRACTOR_NAME, slug: EDEN_CONTRACTOR_SLUG, isActive: true },
  });

  const contract = await prisma.contract.upsert({
    where: { code: EDEN_CONTRACT_CODE },
    update: { name: EDEN_CONTRACT_NAME, isActive: true, isDefault: false, contractorId: contractor.id },
    create: { code: EDEN_CONTRACT_CODE, name: EDEN_CONTRACT_NAME, isActive: true, isDefault: false, contractorId: contractor.id },
  });

  const existingTier = await prisma.rateTier.findFirst({
    where: { contractId: contract.id, tierName: STANDARD_TIER.tierName, isActive: true },
  });
  if (!existingTier) {
    await prisma.rateTier.create({ data: { ...STANDARD_TIER, contractId: contract.id } });
  }

  return contract;
}

async function migrate() {
  const source = await requireContract(SOURCE_CONTRACT_CODE);
  const sites = await prisma.site.findMany({
    where: { contractId: source.id, billingPortfolio: 'EDEN' },
    include: { spv: true },
  });

  console.log(`\nSource contract: ${source.code} (${source.name})`);
  console.log(`Eden sites to move: ${sites.length}`);
  for (const site of sites) {
    console.log(`  - ${site.name} (${site.systemSizeKwp} kWp, SPV ${site.spv?.code || 'unassigned'})`);
  }

  const siteIds = sites.map((site) => site.id);
  const [snapshotCount, adjustmentCount, cmWorkCount] = await Promise.all([
    prisma.billingSnapshot.count({ where: { contractId: source.id, siteId: { in: siteIds } } }),
    prisma.billingAdjustment.count({ where: { contractId: source.id, siteId: { in: siteIds } } }),
    prisma.cmWorkEntry.count({ where: { siteId: { in: siteIds } } }),
  ]);
  console.log(`Billing snapshots to reassign: ${snapshotCount}`);
  console.log(`Billing adjustments to reassign: ${adjustmentCount}`);
  console.log(`CM work entries following the sites: ${cmWorkCount}`);

  if (sites.length === 0) {
    console.log('\nNothing to move.');
    return;
  }

  if (!apply) return;

  const eden = await ensureEdenContract();
  console.log(`\nEden contract ready: ${eden.code} (${eden.id})`);

  // Recreate each SPV the Eden sites use under the Eden contract. The Clearsol-side SPV row is
  // left alone because it may still hold Core sites.
  const spvIdMap = new Map<string, string>();
  for (const site of sites) {
    if (!site.spv || spvIdMap.has(site.spv.id)) continue;
    const edenSpv = await prisma.sPV.upsert({
      where: { contractId_code: { contractId: eden.id, code: site.spv.code } },
      update: { name: site.spv.name },
      create: { contractId: eden.id, code: site.spv.code, name: site.spv.name },
    });
    spvIdMap.set(site.spv.id, edenSpv.id);
    console.log(`  SPV ${site.spv.code} mirrored to Eden contract`);
  }

  for (const site of sites) {
    await prisma.site.update({
      where: { id: site.id },
      data: {
        contractId: eden.id,
        spvId: site.spvId ? spvIdMap.get(site.spvId) || null : null,
      },
    });
  }
  console.log(`  Moved ${sites.length} site(s)`);

  const movedSnapshots = await prisma.billingSnapshot.updateMany({
    where: { contractId: source.id, siteId: { in: siteIds } },
    data: { contractId: eden.id },
  });
  const movedAdjustments = await prisma.billingAdjustment.updateMany({
    where: { contractId: source.id, siteId: { in: siteIds } },
    data: { contractId: eden.id },
  });
  console.log(`  Reassigned ${movedSnapshots.count} billing snapshot(s) and ${movedAdjustments.count} adjustment(s)`);
}

async function revertMigration() {
  const source = await requireContract(SOURCE_CONTRACT_CODE);
  const eden = await prisma.contract.findUnique({ where: { code: EDEN_CONTRACT_CODE }, select: { id: true, code: true } });
  if (!eden) {
    console.log('Eden contract does not exist; nothing to revert.');
    return;
  }

  const sites = await prisma.site.findMany({
    where: { contractId: eden.id, billingPortfolio: 'EDEN' },
    include: { spv: true },
  });
  console.log(`\nEden sites to move back to ${source.code}: ${sites.length}`);

  if (!apply || sites.length === 0) return;

  const siteIds = sites.map((site) => site.id);

  for (const site of sites) {
    let sourceSpvId: string | null = null;
    if (site.spv) {
      const sourceSpv = await prisma.sPV.findUnique({
        where: { contractId_code: { contractId: source.id, code: site.spv.code } },
      });
      sourceSpvId = sourceSpv?.id
        || (await prisma.sPV.create({ data: { contractId: source.id, code: site.spv.code, name: site.spv.name } })).id;
    }
    await prisma.site.update({
      where: { id: site.id },
      data: { contractId: source.id, spvId: sourceSpvId },
    });
  }

  const movedSnapshots = await prisma.billingSnapshot.updateMany({
    where: { contractId: eden.id, siteId: { in: siteIds } },
    data: { contractId: source.id },
  });
  const movedAdjustments = await prisma.billingAdjustment.updateMany({
    where: { contractId: eden.id, siteId: { in: siteIds } },
    data: { contractId: source.id },
  });
  console.log(`  Moved ${sites.length} site(s) back, plus ${movedSnapshots.count} snapshot(s) and ${movedAdjustments.count} adjustment(s)`);
  console.log('  The Eden contractor, contract and mirrored SPV rows are left in place (now empty).');
}

async function main() {
  console.log(revert
    ? `Reverting Eden sites into ${SOURCE_CONTRACT_CODE}`
    : `Moving Eden sites out of ${SOURCE_CONTRACT_CODE} into ${EDEN_CONTRACT_CODE}`);
  console.log(apply ? 'Mode: APPLY (writes to the database)' : 'Mode: DRY RUN (no writes; pass --apply to commit)');

  if (revert) {
    await revertMigration();
  } else {
    await migrate();
  }

  console.log(apply ? '\nDone.' : '\nDry run complete. Re-run with --apply to commit.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Eden contractor migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

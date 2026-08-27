/**
 * Retires the capacity-banded rate tiers and puts every contract on the standing
 * GBP 1.70/kWp rate.
 *
 * Legacy tier rows are deactivated, not deleted, so historical billing snapshots that
 * reference '<20MW' / '20-30MW' / '30-40MW' by name still resolve, and so the change can
 * be reversed.
 *
 * Committed billing snapshots are NOT touched. Months already generated keep the rate
 * they were generated at; only future generation picks up the standing rate.
 *
 *   npx tsx prisma/migrate-standard-rate.ts            # dry run, prints the plan
 *   npx tsx prisma/migrate-standard-rate.ts --apply    # writes
 *   npx tsx prisma/migrate-standard-rate.ts --revert --apply
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL || ''),
});

const STANDARD_TIER_NAME = 'Standard';
const STANDARD_RATE_PER_KWP = 1.7;
const LEGACY_TIER_NAMES = ['<20MW', '20-30MW', '30-40MW'];

const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');

async function migrate() {
  const contracts = await prisma.contract.findMany({ select: { id: true, code: true, name: true } });
  const effectiveFrom = new Date();

  for (const contract of contracts) {
    const legacy = await prisma.rateTier.findMany({
      where: { contractId: contract.id, tierName: { in: LEGACY_TIER_NAMES }, isActive: true },
      select: { id: true, tierName: true, ratePerKwp: true },
    });
    const standard = await prisma.rateTier.findFirst({
      where: { contractId: contract.id, tierName: STANDARD_TIER_NAME },
      select: { id: true, isActive: true, ratePerKwp: true },
    });

    console.log(`\n${contract.code} (${contract.name})`);
    console.log(`  retire ${legacy.length} legacy tier(s): ${legacy.map((t) => `${t.tierName}@${t.ratePerKwp}`).join(', ') || 'none'}`);
    console.log(`  standard tier: ${standard ? `exists (active=${standard.isActive}, rate=${standard.ratePerKwp})` : 'to be created'}`);

    if (!apply) continue;

    if (legacy.length > 0) {
      await prisma.rateTier.updateMany({
        where: { id: { in: legacy.map((tier) => tier.id) } },
        data: { isActive: false, effectiveTo: effectiveFrom },
      });
    }

    if (standard) {
      await prisma.rateTier.update({
        where: { id: standard.id },
        data: { isActive: true, effectiveTo: null, ratePerKwp: STANDARD_RATE_PER_KWP, minCapacityMW: 0, maxCapacityMW: null },
      });
    } else {
      await prisma.rateTier.create({
        data: {
          contractId: contract.id,
          tierName: STANDARD_TIER_NAME,
          minCapacityMW: 0,
          maxCapacityMW: null,
          ratePerKwp: STANDARD_RATE_PER_KWP,
          effectiveFrom,
          isActive: true,
        },
      });
    }
  }
}

async function revertMigration() {
  const contracts = await prisma.contract.findMany({ select: { id: true, code: true, name: true } });

  for (const contract of contracts) {
    const legacy = await prisma.rateTier.findMany({
      where: { contractId: contract.id, tierName: { in: LEGACY_TIER_NAMES } },
      select: { id: true, tierName: true, isActive: true },
    });

    console.log(`\n${contract.code} (${contract.name})`);
    console.log(`  reactivate ${legacy.length} legacy tier(s), deactivate the standard tier`);

    if (!apply) continue;

    if (legacy.length > 0) {
      await prisma.rateTier.updateMany({
        where: { id: { in: legacy.map((tier) => tier.id) } },
        data: { isActive: true, effectiveTo: null },
      });
    }
    await prisma.rateTier.updateMany({
      where: { contractId: contract.id, tierName: STANDARD_TIER_NAME },
      data: { isActive: false },
    });
  }
}

async function main() {
  console.log(revert ? 'Reverting to capacity-banded rate tiers' : `Migrating all contracts to the standing GBP ${STANDARD_RATE_PER_KWP}/kWp rate`);
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
    console.error('Standard rate migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

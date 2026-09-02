/**
 * Backfills the O&M acceptance gate for sites that were already contracted before the
 * acceptedByOm field existed. New and non-contracted sites retain the schema default false.
 *
 * Run this after applying the Prisma schema and before deploying application code that
 * requires the field:
 *
 *   npm run db:om-acceptance            # dry run
 *   npm run db:om-acceptance -- --apply # write
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL || ''),
});

const apply = process.argv.includes('--apply');
const CONTRACTED_STATUSES = ['YES', 'CONTRACTED', 'ACTIVE'];

async function main() {
  const candidates = await prisma.site.findMany({
    where: {
      acceptedByOm: false,
      contractStatus: { in: CONTRACTED_STATUSES },
    },
    select: {
      id: true,
      name: true,
      contractStatus: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Existing contracted sites to mark accepted by O&M: ${candidates.length}`);
  for (const site of candidates) {
    console.log(`  - ${site.name} (${site.contractStatus})`);
  }

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to commit.');
    return;
  }

  const result = await prisma.site.updateMany({
    where: { id: { in: candidates.map((site) => site.id) } },
    data: { acceptedByOm: true },
  });
  console.log(`\nMarked ${result.count} existing contracted site(s) as accepted by O&M.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('O&M acceptance backfill failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

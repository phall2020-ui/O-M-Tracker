import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const DEFAULT_CODE = 'CLEARSOL_O_M';
const DEFAULT_NAME = 'Clearsol O&M';
const DEFAULT_SLUG = 'clearsol-o-m';

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL || ''),
});

async function main() {
  const contractor = await prisma.contractor.upsert({
    where: { code: DEFAULT_CODE },
    update: { name: DEFAULT_NAME, slug: DEFAULT_SLUG, isActive: true },
    create: { code: DEFAULT_CODE, name: DEFAULT_NAME, slug: DEFAULT_SLUG, isActive: true },
  });

  const updatedContracts = await prisma.contract.updateMany({
    where: { contractorId: null },
    data: { contractorId: contractor.id },
  });

  const scopedUsers = await prisma.user.findMany({
    where: { role: { in: ['CONTRACTOR', 'VIEWER'] } },
    select: { id: true },
  });

  for (const user of scopedUsers) {
    await prisma.userContractorAccess.upsert({
      where: { userId_contractorId: { userId: user.id, contractorId: contractor.id } },
      update: {},
      create: { userId: user.id, contractorId: contractor.id },
    });
  }

  console.log(`Backfilled ${updatedContracts.count} contract(s) and ${scopedUsers.length} scoped user access row(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Default contractor backfill failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

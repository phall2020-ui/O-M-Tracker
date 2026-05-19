import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const DEFAULT_CONTRACT_CODE = 'CLEARSOL_O_M';
const DEFAULT_CONTRACT_NAME = 'Clearsol O&M';

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL || ''),
});

const tables = [
  'SPV',
  'Site',
  'RateTier',
  'BillingRun',
  'BillingSnapshot',
  'BillingMonthLock',
  'BillingAdjustment',
] as const;

async function main() {
  await prisma.contract.updateMany({
    where: { code: { not: DEFAULT_CONTRACT_CODE }, isDefault: true },
    data: { isDefault: false },
  });

  const contract = await prisma.contract.upsert({
    where: { code: DEFAULT_CONTRACT_CODE },
    update: { name: DEFAULT_CONTRACT_NAME, isDefault: true, isActive: true },
    create: {
      code: DEFAULT_CONTRACT_CODE,
      name: DEFAULT_CONTRACT_NAME,
      isDefault: true,
      isActive: true,
    },
  });
  const escapedContractId = contract.id.replace(/'/g, "''");

  for (const table of tables) {
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE [dbo].[${table}] SET [contractId] = N'${escapedContractId}' WHERE [contractId] IS NULL`
    );
    console.log(`Backfilled ${updated} ${table} rows`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Default contract backfill failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

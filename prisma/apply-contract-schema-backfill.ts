import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const DEFAULT_CONTRACT_ID = 'default-clearsol-o-m';
const DEFAULT_CONTRACT_CODE = 'CLEARSOL_O_M';
const DEFAULT_CONTRACT_NAME = 'Clearsol O&M';

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL || ''),
});

const contractScopedTables = [
  'SPV',
  'Site',
  'RateTier',
  'BillingRun',
  'BillingSnapshot',
  'BillingMonthLock',
  'BillingAdjustment',
] as const;

async function execute(sql: string) {
  return prisma.$executeRawUnsafe(sql);
}

async function ensureContractTable() {
  await execute(`
    IF OBJECT_ID(N'[dbo].[Contract]', N'U') IS NULL
    BEGIN
      CREATE TABLE [dbo].[Contract] (
        [id] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(MAX) NULL,
        [isDefault] BIT NOT NULL CONSTRAINT [Contract_isDefault_df] DEFAULT 0,
        [isActive] BIT NOT NULL CONSTRAINT [Contract_isActive_df] DEFAULT 1,
        [notionSummaryPageId] NVARCHAR(1000) NULL,
        [notionBillingDatabaseId] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [Contract_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [Contract_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [Contract_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [Contract_code_key] UNIQUE NONCLUSTERED ([code])
      );
    END
  `);
}

async function ensureDefaultContract() {
  await execute(`
    UPDATE [dbo].[Contract]
    SET [isDefault] = 0
    WHERE [code] <> N'${DEFAULT_CONTRACT_CODE}' AND [isDefault] = 1;
  `);

  await execute(`
    IF EXISTS (SELECT 1 FROM [dbo].[Contract] WHERE [code] = N'${DEFAULT_CONTRACT_CODE}')
    BEGIN
      UPDATE [dbo].[Contract]
      SET [name] = N'${DEFAULT_CONTRACT_NAME}', [isDefault] = 1, [isActive] = 1, [updatedAt] = CURRENT_TIMESTAMP
      WHERE [code] = N'${DEFAULT_CONTRACT_CODE}';
    END
    ELSE
    BEGIN
      INSERT INTO [dbo].[Contract] ([id], [code], [name], [isDefault], [isActive], [createdAt], [updatedAt])
      VALUES (N'${DEFAULT_CONTRACT_ID}', N'${DEFAULT_CONTRACT_CODE}', N'${DEFAULT_CONTRACT_NAME}', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END
  `);
}

async function backfillTable(table: string) {
  await execute(`
    IF OBJECT_ID(N'[dbo].[${table}]', N'U') IS NOT NULL
      AND COL_LENGTH(N'[dbo].[${table}]', 'contractId') IS NULL
    BEGIN
      ALTER TABLE [dbo].[${table}] ADD [contractId] NVARCHAR(1000) NULL;
    END
  `);

  const updated = await execute(`
    IF OBJECT_ID(N'[dbo].[${table}]', N'U') IS NOT NULL
    BEGIN
      UPDATE [dbo].[${table}]
      SET [contractId] = N'${DEFAULT_CONTRACT_ID}'
      WHERE [contractId] IS NULL;
    END
  `);

  await execute(`
    IF OBJECT_ID(N'[dbo].[${table}]', N'U') IS NOT NULL
      AND COL_LENGTH(N'[dbo].[${table}]', 'contractId') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM [dbo].[${table}] WHERE [contractId] IS NULL)
    BEGIN
      ALTER TABLE [dbo].[${table}] ALTER COLUMN [contractId] NVARCHAR(1000) NOT NULL;
    END
  `);

  console.log(`Backfilled ${table}: ${updated} rows updated`);
}

async function main() {
  await ensureContractTable();
  await ensureDefaultContract();

  for (const table of contractScopedTables) {
    await backfillTable(table);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Contract schema backfill failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

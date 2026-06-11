import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
const p = new PrismaClient({ adapter: new PrismaMssql(process.env.DATABASE_URL || '') });

// Sites that achieved PAC on 2026-06-09 (Notion Iceland Portfolio Tracker, PAC Status = Achieved)
const PAC_DATE = new Date('2026-06-09T00:00:00.000Z');
const PACD = [
  'Iceland - Bridgend Unit 2 Parc Plaza','Iceland - Crewe','Iceland - Dereham',
  'Iceland - Scunthorpe','Iceland - Wakefield','Iceland - York Clifton Moor',
];

const contract = await p.contract.findUnique({ where: { code: 'CLEARSOL_O_M' } });
for (const name of PACD) {
  const site = await p.site.findFirst({ where: { name, contractId: contract.id } });
  if (!site) { console.log(`!! NOT FOUND: ${name}`); continue; }
  await p.site.update({ where: { id: site.id }, data: { actualPacDate: PAC_DATE } });
  console.log(`Set actualPacDate 2026-06-09: ${name}`);
}
await p.$disconnect();

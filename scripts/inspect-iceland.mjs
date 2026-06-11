import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
const p = new PrismaClient({ adapter: new PrismaMssql(process.env.DATABASE_URL || '') });
const sites = await p.site.findMany({
  where: { name: { startsWith: 'Iceland' } },
  include: { spv: true },
  orderBy: { name: 'asc' },
});
for (const s of sites) {
  console.log(`${s.name} | status=${s.contractStatus} | spv=${s.spv?.code ?? 'NONE'} | onboard=${s.onboardDate? s.onboardDate.toISOString().slice(0,10):'null'} | forecastPac=${s.forecastPacDate? s.forecastPacDate.toISOString().slice(0,10):'null'} | actualPac=${s.actualPacDate? s.actualPacDate.toISOString().slice(0,10):'null'}`);
}
await p.$disconnect();

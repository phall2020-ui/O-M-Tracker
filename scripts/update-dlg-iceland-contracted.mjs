import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const p = new PrismaClient({ adapter: new PrismaMssql(process.env.DATABASE_URL || '') });

const DLG_SITES = [
  'DLG - Beaconsfield','DLG - Bristol Long Ashton','DLG - Bristol Westbury','DLG - Dundee',
  'DLG - Hamilton','DLG - Kings Hill','DLG - Milton Keynes','DLG - Poole','DLG - Purley','DLG - Stevenage',
];
const ICELAND_SITES = [
  'Iceland - Bridgend Unit 2 Parc Plaza','Iceland - Crewe','Iceland - Dereham','Iceland - Doncaster',
  'Iceland - Merthyr','Iceland - Scunthorpe','Iceland - Wakefield','Iceland - York Clifton Moor',
];

const contract = await p.contract.findUnique({ where: { code: 'CLEARSOL_O_M' } });
if (!contract) throw new Error('CLEARSOL_O_M contract not found');

const ad1 = await p.sPV.findFirst({ where: { code: 'AD1', contractId: contract.id } });
if (!ad1) throw new Error('AD1 SPV not found');

let se4 = await p.sPV.findFirst({ where: { code: 'SE4', contractId: contract.id } });
if (!se4) {
  se4 = await p.sPV.create({ data: { code: 'SE4', name: 'Shawton Energy SPV4 Limited', contractId: contract.id } });
  console.log(`Created SPV SE4 (${se4.id})`);
} else {
  console.log('SPV SE4 already exists');
}

for (const [names, spv] of [[DLG_SITES, ad1], [ICELAND_SITES, se4]]) {
  for (const name of names) {
    const site = await p.site.findFirst({ where: { name, contractId: contract.id } });
    if (!site) { console.log(`!! NOT FOUND: ${name}`); continue; }
    await p.site.update({ where: { id: site.id }, data: { contractStatus: 'YES', spvId: spv.id } });
    console.log(`Updated: ${name}  ${site.contractStatus} -> YES, spv -> ${spv.code}`);
  }
}
await p.$disconnect();

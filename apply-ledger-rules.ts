import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Applying DB rules...');
  try {
    await prisma.$executeRawUnsafe(`CREATE RULE no_update_ledger AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;`);
    console.log('Created rule: no_update_ledger');
  } catch (e: any) {
    if (e.message.includes('already exists')) {
      console.log('Rule no_update_ledger already exists.');
    } else {
      console.error(e);
    }
  }

  try {
    await prisma.$executeRawUnsafe(`CREATE RULE no_delete_ledger AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;`);
    console.log('Created rule: no_delete_ledger');
  } catch (e: any) {
    if (e.message.includes('already exists')) {
      console.log('Rule no_delete_ledger already exists.');
    } else {
      console.error(e);
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

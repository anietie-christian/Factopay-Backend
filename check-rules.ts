import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.$queryRawUnsafe(`
    SELECT rulename, definition 
    FROM pg_rules 
    WHERE tablename = 'ledger_entries';
  `);
  console.log(rules);
}

main().finally(() => prisma.$disconnect());

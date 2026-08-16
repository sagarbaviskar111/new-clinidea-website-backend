const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function update() {
  const batches = await prisma.batch.findMany({
    where: {
      batchName: {
        contains: 'August 2026'
      }
    }
  });

  console.log('Found batches:', batches);
  for (let b of batches) {
    await prisma.batch.update({
      where: { id: b.id },
      data: { storageType: 'local' }
    });
    console.log('Updated batch:', b.batchName);
  }
}

update().catch(console.error).finally(() => prisma.$disconnect());

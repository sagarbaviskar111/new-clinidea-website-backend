const db = require('./database');

async function update() {
  const batches = await db.batch.findMany({
    where: {
      batchName: {
        contains: 'August 2026'
      }
    }
  });

  console.log('Found batches:', batches);
  for (let b of batches) {
    await db.batch.update({
      where: { id: b.id },
      data: { storageType: 'local' }
    });
    console.log('Updated batch:', b.batchName);
  }
}

update().catch(console.error).finally(() => db.$disconnect());

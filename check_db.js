const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: 15 },
      include: { batch: true }
    });
    console.log("Enrollments for user 15:", enrollments);

    const batchIds = enrollments.map(e => e.batchId).filter(id => id !== null);
    console.log("Batch IDs:", batchIds);

    if (batchIds.length > 0) {
      const contents = await prisma.lMSContent.findMany({
        where: { batchId: { in: batchIds } }
      });
      console.log("Contents for batches:", contents);
    }
  } catch (err) {
    console.error(err);
  } finally {
    prisma.$disconnect();
  }
}

check();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const courses = await prisma.course.findMany();
  courses.forEach(c => {
    console.log(c.name + ': brochureUrl=' + c.brochureUrl);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const courses = await prisma.course.findMany();
  courses.forEach(c => {
    console.log(`${c.name}: brochureUrl=${c.brochureUrl}, pdf=${c.pdf}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

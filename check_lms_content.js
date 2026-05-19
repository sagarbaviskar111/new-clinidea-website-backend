const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const contents = await prisma.lMSContent.findMany();
  console.log("Total LMS Contents:", contents.length);
  console.log(contents);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

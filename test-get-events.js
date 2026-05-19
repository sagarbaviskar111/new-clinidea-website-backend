const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.event.findMany();
  console.log(events);
}
main();

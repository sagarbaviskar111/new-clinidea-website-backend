const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({ where: { role: 'student' }});
  console.log(users);
}
check().finally(() => prisma.$disconnect());

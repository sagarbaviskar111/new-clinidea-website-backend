const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const admins = await prisma.admin.findMany();
  console.log('--- ADMINS IN DATABASE ---');
  admins.forEach(a => {
    console.log(`Email: ${a.email} | Role: ${a.role}`);
  });
}

check().finally(() => prisma.$disconnect());

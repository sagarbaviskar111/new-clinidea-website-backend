const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function u() {
  await prisma.user.update({
    where: { email: 'Tusharpatil10102002@gmail.com' },
    data: { registeredCourse: 'Clinical Research & Pharmacovigilance' }
  });
}
u().then(() => console.log('updated')).finally(() => prisma.$disconnect());

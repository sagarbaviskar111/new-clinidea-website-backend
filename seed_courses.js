const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const courses = [
  { name: 'Clinical Research & Pharmacovigilance', fees: 50000 },
  { name: 'Clinical Research & Data Management', fees: 50000 },
  { name: 'Clinical Research, Pharmacovigilance & Data Management', fees: 60000 },
  { name: 'Clinical Research & Regulatory Affairs', fees: 50000 },
  { name: 'Clinical Research & Medical Writing', fees: 50000 },
  { name: 'Clinical Research and Medical Coding', fees: 50000 }
];

async function seed() {
  for (const c of courses) {
    const existing = await prisma.course.findFirst({ where: { name: c.name } });
    if (!existing) {
      await prisma.course.create({ data: { name: c.name, fees: c.fees } });
      console.log(`Added course: ${c.name}`);
    } else {
      console.log(`Course already exists: ${c.name}`);
    }
  }
  console.log("Seeding complete.");
}

seed().catch(console.error).finally(() => prisma.$disconnect());

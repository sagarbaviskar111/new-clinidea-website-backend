const db = require('./database');

async function main() {
  const courses = await db.course.findMany();
  courses.forEach(c => {
    console.log(c.name + ': brochureUrl=' + c.brochureUrl);
  });
}

main().catch(console.error).finally(() => db.$disconnect());

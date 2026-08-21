const db = require('./database');

async function main() {
  const courses = await db.course.findMany();
  courses.forEach(c => {
    console.log(`${c.name}: brochureUrl=${c.brochureUrl}, pdf=${c.pdf}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => db.$disconnect());

const db = require('./database');

async function main() {
  const courses = await db.course.findMany();
  console.log(courses.map(c => c.name));
}

main()
  .catch(e => console.error(e))
  .finally(() => db.$disconnect());

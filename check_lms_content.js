const db = require('./database');

async function main() {
  const contents = await db.lMSContent.findMany();
  console.log("Total LMS Contents:", contents.length);
  console.log(contents);
}

main()
  .catch(e => console.error(e))
  .finally(() => db.$disconnect());

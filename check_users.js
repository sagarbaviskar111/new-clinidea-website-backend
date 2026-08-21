const db = require('./database');

async function check() {
  const users = await db.user.findMany({ where: { role: 'student' }});
  console.log(users);
}
check().finally(() => db.$disconnect());

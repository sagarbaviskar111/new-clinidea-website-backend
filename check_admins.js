const db = require('./database');

async function check() {
  const admins = await db.admin.findMany();
  console.log('--- ADMINS IN DATABASE ---');
  admins.forEach(a => {
    console.log(`Email: ${a.email} | Role: ${a.role}`);
  });
}

check().finally(() => db.$disconnect());

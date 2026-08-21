const db = require('./database');
async function u() {
  await db.user.update({
    where: { email: 'Tusharpatil10102002@gmail.com' },
    data: { registeredCourse: 'Clinical Research & Pharmacovigilance' }
  });
}
u().then(() => console.log('updated')).finally(() => db.$disconnect());

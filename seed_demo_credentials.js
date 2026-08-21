const bcrypt = require('bcryptjs');
const db = require('./database');

const PASSWORD = '123456';

async function seedDemoCredentials() {
  await db.connect();
  const password = await bcrypt.hash(PASSWORD, 10);

  await db.admin.upsert({
    where: { email: 'admin@clinidea.in' },
    update: { password, role: 'superadmin' },
    create: { email: 'admin@clinidea.in', password, role: 'superadmin' }
  });

  await db.admin.upsert({
    where: { email: 'mentor@clinidea.in' },
    update: { password, role: 'mentor' },
    create: { email: 'mentor@clinidea.in', password, role: 'mentor' }
  });

  await db.user.upsert({
    where: { email: 'student@clinidea.in' },
    update: { password, role: 'student' },
    create: {
      fullName: 'Demo Student',
      email: 'student@clinidea.in',
      phone: '9876543210',
      password,
      role: 'student',
      isRegistrationConfirmed: true,
      registrationFeePaid: true
    }
  });

  console.log('Demo admin, mentor, and student credentials are ready.');
}

seedDemoCredentials()
  .catch((error) => {
    console.error('Unable to seed demo credentials:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const user = await prisma.user.findUnique({ where: { id: 15 }});
  console.log("User:", user.email);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'super-secret-clinidea-key', { expiresIn: '1d' });

  const res = await fetch('http://localhost:5000/api/student/content', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error).finally(() => prisma.$disconnect());

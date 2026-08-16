const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const students = [
  { oldEmail: "shreyadaga31@gmail.com", loginId: "Shreya.Daga@clinidea.in", password: "Shreya@9461757898" },
  { oldEmail: "karynabar@gmail.com", loginId: "Karunavati.Nabar@clinidea.in", password: "Karunavati@8291186916" },
  { oldEmail: "shwetapagare183@gmail.com", loginId: "Shweta.Pagare@clinidea.in", password: "Shweta@8766689151" },
  { oldEmail: "seemachauhan0302@gmail.com", loginId: "Seema.Chauhan@clinidea.in", password: "Seema@7973904586" },
  { oldEmail: "debadritaghosh88@gmail.com", loginId: "Debadrita.Ghosh@clinidea.in", password: "Debadrita@8697461890" },
  { oldEmail: "pawarsanjay1396@gmail.com", loginId: "Sanjay.Pawar@clinidea.in", password: "Sanjay@9926999827" },
  { oldEmail: "patidarsomesh166@gmail.com", loginId: "Somesh.Patidar@clinidea.in", password: "Somesh@9691749822" },
  { oldEmail: "choukseygourish@gmail.com", loginId: "Gourish.Chouksey@clinidea.in", password: "Gourish@8815989114" },
  { oldEmail: "shubhamsharnagat66@gmail.com", loginId: "Shubham.Sharnagat@clinidea.in", password: "Shubham@9244630832" },
];

async function main() {
  for (const s of students) {
    const user = await prisma.user.findUnique({ where: { email: s.oldEmail } });
    if (user) {
      const hashedPassword = await bcrypt.hash(s.password, 10);
      await prisma.user.update({
        where: { email: s.oldEmail },
        data: {
          email: s.loginId,
          password: hashedPassword
        }
      });
      console.log(`Updated ${s.oldEmail} to ${s.loginId}`);
    } else {
      console.log(`User ${s.oldEmail} not found!`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

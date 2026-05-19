require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const enrollment = await prisma.enrollment.create({
      data: {
        userId: 15, // Tushar Patil
        batchId: 2, // assume batch 2 exists
        courseName: 'Clinical Research & Pharmacovigilance',
        enrollmentStatus: 'enrolled',
        paymentStatus: 'assigned_by_admin',
        amount: 0,
        feesPaid: 0,
        feesPending: 0 
      }
    });
    console.log(enrollment);
  } catch (err) {
    console.error(err);
  } finally {
    prisma.$disconnect();
  }
}

test();

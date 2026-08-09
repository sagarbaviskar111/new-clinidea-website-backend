const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateReceiptPDF } = require('./utils/pdf_generator');

async function fixMissingReceipts() {
  console.log("Looking for users with registrationFeePaid=true but no payment record...");
  const users = await prisma.user.findMany({
    where: { registrationFeePaid: true }
  });

  let fixedCount = 0;
  for (const user of users) {
    const existingPayment = await prisma.payment.findFirst({
      where: { userId: user.id, paymentType: 'registration' }
    });

    if (!existingPayment) {
      console.log(`Fixing user: ${user.fullName} (${user.email})`);
      const receiptNo = 'REG-' + Date.now();
      const pdfUrl = await generateReceiptPDF({
        receiptNo,
        studentName: user.fullName,
        paymentId: 'REG-BYPASS',
        mobileNo: user.phone,
        email: user.email,
        course: 'Registration Fees',
        method: 'Manual/Bypass',
        paymentMode: 'System',
        totalFees: 10000,
        feesPaid: 10000,
        feesPending: 0
      });

      await prisma.payment.create({
        data: {
          userId: user.id,
          courseName: 'Registration Fees',
          amount: 10000,
          paymentMethod: 'System',
          paymentStatus: 'paid',
          transactionId: 'REG-BYPASS-' + Date.now(),
          fileUrl: pdfUrl,
          paymentType: 'registration',
          isOverdue: false
        }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { registrationReceiptUrl: pdfUrl }
      });
      fixedCount++;
    }
  }

  console.log(`Finished fixing ${fixedCount} missing receipts.`);
}

fixMissingReceipts().catch(console.error).finally(() => prisma.$disconnect());

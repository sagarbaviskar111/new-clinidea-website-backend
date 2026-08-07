const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { generateReceiptPDF } = require('../utils/pdf_generator');

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

// User auth middleware is applied in server.js before this router
// GET /api/student/payments
router.get('/payments', async (req, res) => {
  try {
    const userId = req.userId;
    const payments = await prisma.payment.findMany({
      where: { userId },
      orderBy: { dueDate: 'asc' }
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { userId }
    });

    res.json({
      payments,
      enrollments
    });
  } catch (error) {
    console.error('Error fetching student payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// POST /api/student/pay-installment
router.post('/pay-installment', async (req, res) => {
  try {
    const userId = req.userId;
    const { paymentId } = req.body; // The DB id of the pending installment

    const payment = await prisma.payment.findUnique({
      where: { id: parseInt(paymentId) },
      include: { user: true }
    });

    if (!payment || payment.userId !== userId) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Payment already completed' });
    }

    const options = {
      amount: Math.round(payment.amount * 100), // amount in paisa
      currency: 'INR',
      receipt: `inst_receipt_${payment.id}`
    };

    const order = await razorpayInstance.orders.create(options);
    res.json({
      orderId: order.id,
      amount: options.amount,
      currency: options.currency,
      key: process.env.RAZORPAY_KEY_ID,
      paymentId: payment.id,
      userName: payment.user.fullName,
      userEmail: payment.user.email,
      userPhone: payment.user.phone
    });
  } catch (error) {
    console.error('Error creating razorpay order:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

// POST /api/student/verify-installment
router.post('/verify-installment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid signature, payment verification failed' });
    }

    // Process payment success
    await prisma.$transaction(async (tx) => {
      // 1. Update Payment
      const updatedPayment = await tx.payment.update({
        where: { id: parseInt(paymentId) },
        data: {
          paymentStatus: 'paid',
          transactionId: razorpay_payment_id,
          paymentDate: new Date(),
          isOverdue: false,
          paymentMethod: 'razorpay'
        },
        include: { user: true }
      });

      // 2. Generate Receipt ID if needed (random or sequential)
      const receiptNo = Math.floor(100000 + Math.random() * 900000);
      await tx.payment.update({
        where: { id: parseInt(paymentId) },
        data: { receiptNumber: receiptNo }
      });

      // 3. Update Enrollment totals
      const enrollments = await tx.enrollment.findMany({ where: { userId: updatedPayment.userId } });
      if (enrollments.length > 0) {
        // Just updating the first enrollment to match the logic (assuming 1 active course)
        const activeEnrollment = enrollments[0];
        const newPaid = activeEnrollment.feesPaid + updatedPayment.amount;
        const newPending = activeEnrollment.totalFees - newPaid;

        await tx.enrollment.update({
          where: { id: activeEnrollment.id },
          data: {
            feesPaid: newPaid,
            feesPending: newPending > 0 ? newPending : 0
          }
        });
      }
    });

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// GET /api/student/payment-receipt/:paymentId
router.get('/payment-receipt/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await prisma.payment.findUnique({
      where: { id: parseInt(paymentId) },
      include: { user: true }
    });

    if (!payment || payment.paymentStatus !== 'paid') {
      return res.status(404).json({ error: 'Valid payment not found' });
    }
    
    // Only allow the user or admin to view
    if (req.userId && payment.userId !== req.userId) {
       // but wait, we need to allow admin? This route might only be called by student for now.
       return res.status(403).json({ error: 'Forbidden' });
    }

    const receiptData = {
      receiptNumber: payment.receiptNumber || `R-${payment.id}`,
      paymentDate: payment.paymentDate,
      studentName: payment.user.fullName,
      studentEmail: payment.user.email,
      studentPhone: payment.user.phone,
      amount: payment.amount,
      transactionId: payment.transactionId,
      courseName: payment.courseName,
      paymentMethod: payment.paymentMethod || 'Online'
    };

    const pdfBuffer = await generateReceiptPDF(receiptData);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${receiptData.receiptNumber}.pdf`);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating receipt PDF:', error);
    res.status(500).json({ error: 'Failed to generate receipt' });
  }
});

module.exports = router;

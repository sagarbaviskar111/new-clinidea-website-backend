const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ensureSuperAdmin = (req, res, next) => {
  if (req.adminRole !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden: Super Admin only' });
  }
  next();
};
// GET /api/admin/student-management/batches
router.get('/batches', ensureSuperAdmin, async (req, res) => {
  try {
    // A batch is "started" if startDate is not null and is in the past
    const batches = await prisma.batch.findMany({
      where: {
        startDate: {
          not: null,
          lte: new Date()
        }
      },
      include: {
        course: true,
        _count: {
          select: { enrollments: true }
        }
      },
      orderBy: { startDate: 'desc' }
    });
    res.json(batches);
  } catch (error) {
    console.error('Error fetching started batches:', error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// GET /api/admin/student-management/batch/:batchId
router.get('/batch/:batchId', ensureSuperAdmin, async (req, res) => {
  try {
    const { batchId } = req.params;
    
    // Find all users enrolled in this batch
    const enrollments = await prisma.enrollment.findMany({
      where: { batchId: parseInt(batchId) },
      include: {
        user: {
          include: {
            payments: {
              where: {
                paymentType: 'fee_installment'
              },
              orderBy: {
                installmentNo: 'asc'
              }
            }
          }
        }
      }
    });
    
    // Format response
    const students = enrollments.map(e => ({
      userId: e.user.id,
      enrollmentId: e.id,
      name: e.user.fullName,
      email: e.user.email,
      phone: e.user.phone,
      totalFees: e.totalFees,
      feesPaid: e.feesPaid,
      feesPending: e.feesPending,
      feePlanType: e.feePlanType,
      lmsBlocked: e.user.lmsBlocked,
      adminUnblocked: e.user.adminUnblocked,
      payments: e.user.payments
    }));

    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// POST /api/admin/student-management/configure-fees
router.post('/configure-fees', ensureSuperAdmin, async (req, res) => {
  try {
    const { userId, enrollmentId, totalFees, feePlanType, startDate } = req.body;
    
    if (!userId || !enrollmentId || !totalFees || !feePlanType || !startDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const start = new Date(startDate);

    // 1. Calculate due dates based on feePlanType
    let installments = [];
    const baseAmount = totalFees;

    if (feePlanType === '1_installment') {
      // Due 2 months after start date
      const due = new Date(start);
      due.setMonth(due.getMonth() + 2);
      installments.push({ amount: baseAmount, due, no: 1 });
    } 
    else if (feePlanType === '2_installments') {
      // 1st due 1 month after start
      const due1 = new Date(start);
      due1.setMonth(due1.getMonth() + 1);
      // 2nd due 2 months after 1st due date
      const due2 = new Date(due1);
      due2.setMonth(due2.getMonth() + 2);
      
      const part = parseFloat((baseAmount / 2).toFixed(2));
      installments.push({ amount: part, due: due1, no: 1 });
      installments.push({ amount: part, due: due2, no: 2 });
    }
    else if (feePlanType === '3_installments') {
      // 1st due 1 month after start
      const due1 = new Date(start);
      due1.setMonth(due1.getMonth() + 1);
      // 2nd due 2 months after 1st
      const due2 = new Date(due1);
      due2.setMonth(due2.getMonth() + 2);
      // 3rd due 2 months after 2nd
      const due3 = new Date(due2);
      due3.setMonth(due3.getMonth() + 2);
      
      const part = parseFloat((baseAmount / 3).toFixed(2));
      installments.push({ amount: part, due: due1, no: 1 });
      installments.push({ amount: part, due: due2, no: 2 });
      installments.push({ amount: part, due: due3, no: 3 });
    } else {
      return res.status(400).json({ error: 'Invalid fee plan type' });
    }

    // Use transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      // Update enrollment
      await tx.enrollment.update({
        where: { id: parseInt(enrollmentId) },
        data: {
          totalFees: parseFloat(totalFees),
          feePlanType,
          installmentCount: installments.length,
          feesPending: parseFloat(totalFees) // assuming no prior fees paid logic for this simple reset
        }
      });

      // Delete existing PENDING fee_installment payments for this user
      // so we don't duplicate them if admin updates plan
      await tx.payment.deleteMany({
        where: {
          userId: parseInt(userId),
          paymentType: 'fee_installment',
          paymentStatus: 'pending'
        }
      });

      // Create new payments
      const enrollment = await tx.enrollment.findUnique({ where: { id: parseInt(enrollmentId) } });
      for (const inst of installments) {
        await tx.payment.create({
          data: {
            userId: parseInt(userId),
            courseName: enrollment.courseName,
            amount: inst.amount,
            paymentStatus: 'pending',
            paymentType: 'fee_installment',
            dueDate: inst.due,
            installmentNo: inst.no
          }
        });
      }
    });

    res.json({ success: true, message: 'Fee configuration updated and installments generated.' });
  } catch (error) {
    console.error('Error configuring fees:', error);
    res.status(500).json({ error: 'Failed to configure fees' });
  }
});

// POST /api/admin/student-management/toggle-block
router.post('/toggle-block', ensureSuperAdmin, async (req, res) => {
  try {
    const { userId, blockAction } = req.body; // blockAction: 'unblock' or 'block'
    
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        adminUnblocked: blockAction === 'unblock'
      }
    });
    
    res.json({ success: true, message: `Student manually ${blockAction}ed successfully.` });
  } catch (error) {
    console.error('Error toggling block:', error);
    res.status(500).json({ error: 'Failed to toggle block status' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const db = require('../database');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

// Student ID: name initials + registration-year (stands in for a batch code, since no
// batch is assigned until later by admin) + a random 4-digit number, retried on collision.
async function generateStudentId(fullName) {
  const initials = String(fullName || 'STU').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const yearCode = String(new Date().getFullYear()).slice(-2);
  for (let attempt = 0; attempt < 10; attempt++) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${initials}${yearCode}${random}`;
    const existing = await db.user.findFirst({ where: { studentId: candidate } });
    if (!existing) return candidate;
  }
  return `${initials}${yearCode}${Date.now().toString().slice(-4)}`;
}

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, identifier, password } = req.body;
    const loginId = (email || identifier || '').trim();

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check admin table first
    let user = await db.admin.findUnique({ where: { email: loginId.toLowerCase() } });
    let role = user?.role || 'admin';

    // If not admin, check student table
    if (!user) {
      user = await db.user.findFirst({ where: { email: loginId } }) || await db.user.findFirst({ where: { phone: loginId } });
      role = 'student';
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      role,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName || user.name,
        role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login', message: error.message });
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name required' });
    }

    // Check if user already exists
    let existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create student user
    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName: name,
        phone
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'student' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'student'
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register', message: error.message });
  }
});

// Create Razorpay order for the one-time registration fee
router.post('/register-fee', async (req, res) => {
  try {
    const { full_name, phone, email, password, course, city, admissionId } = req.body;

    if (!full_name || !phone || !email || !password || !course) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    const order = await razorpayInstance.orders.create({
      amount: 10000 * 100, // ₹10,000 in paise
      currency: 'INR',
      receipt: 'reg_receipt_' + Date.now()
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      userDetails: { full_name, phone, email, password, course, city, admissionId }
    });
  } catch (error) {
    console.error('Registration fee order error:', error.message);
    res.status(500).json({ error: 'Failed to create registration order.' });
  }
});

// Verify Razorpay payment and finalize the student account
router.post('/verify-registration', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userDetails } = req.body;

    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature.' });
    }

    const { full_name, phone, email, password, course, city, admissionId } = userDetails;
    const hashedPassword = await bcrypt.hash(password, 10);

    let user = await db.user.findFirst({ where: { email } }) || await db.user.findFirst({ where: { phone } });
    if (user) {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          fullName: full_name,
          password: hashedPassword,
          registrationFeePaid: true,
          isRegistrationConfirmed: true,
          registeredCourse: course,
          status: 'active'
        }
      });
    } else {
      user = await db.user.create({
        data: {
          fullName: full_name,
          phone,
          email,
          password: hashedPassword,
          role: 'student',
          status: 'active',
          registrationFeePaid: true,
          isRegistrationConfirmed: true,
          registeredCourse: course
        }
      });
    }

    await db.studentProfile.upsert({
      where: { userId: user.id },
      update: { city },
      create: { userId: user.id, city }
    });

    if (admissionId) {
      await db.admission.update({ where: { id: admissionId }, data: { status: 'converted', userId: user.id } }).catch(() => {});
    }

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        courseName: 'Registration',
        amount: 10000,
        paymentMethod: 'razorpay',
        paymentStatus: 'completed',
        transactionId: razorpay_payment_id
      }
    });

    try {
      const { generateRegistrationReceiptPDF } = require('../utils/pdf_generator');
      const pdfUrl = await generateRegistrationReceiptPDF({
        studentName: user.fullName,
        courseName: 'Registration',
        mobileNo: user.phone,
        email: user.email,
        amountPaid: 10000,
        totalFees: 10000,
        remainingFees: 0,
        paymentType: 'Online Registration',
        transactionId: payment.transactionId,
        timestamp: new Date()
      });
      await db.user.update({ where: { id: user.id }, data: { registrationReceiptUrl: pdfUrl } });

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const emailService = require('../utils/emailService');
        const absolutePdfPath = require('path').join(__dirname, '..', pdfUrl);
        await emailService.sendRegistrationReceipt(user, 10000, razorpay_payment_id, absolutePdfPath);
      }
    } catch (err) {
      console.error('Receipt generation/email failed:', err.message);
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ success: true, message: 'Registration successful!', token, user });
  } catch (error) {
    console.error('Verify registration error:', error.message);
    res.status(500).json({ error: 'Failed to submit registration payment details.' });
  }
});

// Shared: recompute the fee breakdown for a course + payment mode + optional coupon.
// Always recomputed server-side (never trusts client-supplied amounts) so the Razorpay
// order and the later verification always agree on the real amount.
async function computeFeeBreakdown({ course, paymentMode, couponCode }) {
  const courseDoc = await db.course.findFirst({ where: { name: course } });
  if (!courseDoc) throw new Error('Course not found');

  // Base course fee is identical for both payment modes. The installment plan only
  // adds a separate processing fee, charged once with the first installment.
  const plan = courseDoc.paymentPlan || {};
  const baseFee = Number(courseDoc.fees) || 0;
  const installmentProcessingFee = Number(plan.installmentAdditionalFee) || 0;
  const configuredInstallments = Array.isArray(plan.installments) && plan.installments.length
    ? plan.installments
    : [{ amount: baseFee, daysAfter: 0 }];

  let discountPercent = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase();
    const coupon = await db.coupon.findFirst({ where: { code } });
    if (coupon && coupon.isActive !== false
      && !(coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses)
      && !(coupon.expiryDate && new Date(coupon.expiryDate) < new Date())) {
      discountPercent = Number(coupon.discountPercent) || 0;
      appliedCoupon = coupon;
    }
  }

  // Coupon discount applies only to the base course fee, never to the installment processing fee.
  const ratio = 1 - discountPercent / 100;

  if (paymentMode !== 'installment') {
    const discountedBaseTotal = Math.round(baseFee * ratio * 100) / 100;
    return {
      courseDoc, baseFee, discountPercent, installmentProcessingFee: 0,
      discountedBaseTotal, discountedTotal: discountedBaseTotal, amountNow: discountedBaseTotal,
      installmentsSchedule: [], appliedCoupon
    };
  }

  // The processing fee is a single amount the admin sets; it's split evenly across
  // every installment (not just the first) so each due payment shows its own share.
  const n = configuredInstallments.length;
  const baseFeeShare = Math.floor(installmentProcessingFee / n);
  const feeShares = new Array(n).fill(baseFeeShare);
  feeShares[n - 1] += installmentProcessingFee - baseFeeShare * n; // remainder to the last installment

  const installmentsSchedule = configuredInstallments.map((i, idx) => ({
    amount: Math.round(Number(i.amount || 0) * ratio * 100) / 100,
    feeAmount: feeShares[idx],
    daysAfter: Number(i.daysAfter || 0)
  }));
  const discountedBaseTotal = Math.round(installmentsSchedule.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
  const first = installmentsSchedule[0];
  const amountNow = Math.round(((first?.amount || 0) + (first?.feeAmount || 0)) * 100) / 100;
  const discountedTotal = Math.round((discountedBaseTotal + installmentProcessingFee) * 100) / 100;

  return {
    courseDoc, baseFee, discountPercent, installmentProcessingFee,
    discountedBaseTotal, discountedTotal, amountNow,
    installmentsSchedule, appliedCoupon
  };
}

// Create Razorpay order for a course's fee (one-time or first installment), with optional coupon
router.post('/course-fee-order', async (req, res) => {
  try {
    const { full_name, phone, email, password, course, city, admissionId, paymentMode, couponCode } = req.body;

    if (!full_name || !phone || !email || !password || !course) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }
    if (!['onetime', 'installment'].includes(paymentMode)) {
      return res.status(400).json({ error: 'Invalid payment mode.' });
    }

    const breakdown = await computeFeeBreakdown({ course, paymentMode, couponCode });
    if (breakdown.amountNow <= 0) return res.status(400).json({ error: 'Invalid course fee configuration.' });

    const order = await razorpayInstance.orders.create({
      amount: Math.round(breakdown.amountNow * 100),
      currency: 'INR',
      receipt: 'course_fee_' + Date.now()
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      breakdown: {
        baseFee: breakdown.baseFee,
        discountPercent: breakdown.discountPercent,
        installmentProcessingFee: breakdown.installmentProcessingFee,
        discountedBaseTotal: breakdown.discountedBaseTotal,
        discountedTotal: breakdown.discountedTotal,
        amountNow: breakdown.amountNow,
        installmentsSchedule: breakdown.installmentsSchedule
      },
      userDetails: { full_name, phone, email, password, course, city, admissionId, paymentMode, couponCode }
    });
  } catch (error) {
    console.error('Course fee order error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to create payment order.' });
  }
});

// Verify Razorpay payment, create the account + enrollment, and schedule remaining installments
router.post('/verify-course-fee', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userDetails } = req.body;

    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature.' });
    }

    const { full_name, phone, email, password, course, city, admissionId, paymentMode, couponCode } = userDetails;
    const breakdown = await computeFeeBreakdown({ course, paymentMode, couponCode });
    const hashedPassword = await bcrypt.hash(password, 10);

    let user = await db.user.findFirst({ where: { email } }) || await db.user.findFirst({ where: { phone } });
    if (user) {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          fullName: full_name,
          password: hashedPassword,
          registrationFeePaid: true,
          isRegistrationConfirmed: true,
          registeredCourse: course,
          status: 'active'
        }
      });
    } else {
      user = await db.user.create({
        data: {
          fullName: full_name,
          phone,
          email,
          password: hashedPassword,
          role: 'student',
          status: 'active',
          registrationFeePaid: true,
          isRegistrationConfirmed: true,
          registeredCourse: course
        }
      });
    }

    await db.studentProfile.upsert({
      where: { userId: user.id },
      update: { city },
      create: { userId: user.id, city }
    });

    if (!user.studentId) {
      const studentId = await generateStudentId(user.fullName);
      user = await db.user.update({ where: { id: user.id }, data: { studentId } });
    }

    const remainingInstallments = paymentMode === 'installment' ? breakdown.installmentsSchedule.slice(1) : [];

    await db.enrollment.create({
      data: {
        userId: user.id,
        courseName: course,
        totalFees: breakdown.discountedTotal,
        feesPaid: breakdown.amountNow,
        feesPending: Math.max(breakdown.discountedTotal - breakdown.amountNow, 0),
        feePlanType: paymentMode
      }
    });

    const firstInstallmentFee = paymentMode === 'installment' ? (breakdown.installmentsSchedule[0]?.feeAmount || 0) : 0;

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        courseName: course,
        amount: breakdown.amountNow,
        feeAmount: firstInstallmentFee,
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        paymentDate: new Date(),
        transactionId: razorpay_payment_id
      }
    });

    for (let i = 0; i < remainingInstallments.length; i++) {
      const inst = remainingInstallments[i];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + inst.daysAfter);
      await db.payment.create({
        data: {
          userId: user.id,
          courseName: course,
          amount: Math.round((inst.amount + inst.feeAmount) * 100) / 100,
          feeAmount: inst.feeAmount,
          paymentStatus: 'pending',
          paymentType: 'fee_installment',
          dueDate,
          installmentNo: i + 2
        }
      });
    }

    if (breakdown.appliedCoupon) {
      await db.coupon.update({
        where: { id: breakdown.appliedCoupon.id },
        data: { usedCount: (breakdown.appliedCoupon.usedCount || 0) + 1 }
      }).catch(() => {});
    }

    if (admissionId) {
      await db.admission.update({ where: { id: admissionId }, data: { status: 'converted', userId: user.id } }).catch(() => {});
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      message: 'Registration successful!',
      token,
      user,
      summary: {
        studentId: user.studentId,
        courseName: course,
        totalFees: breakdown.discountedTotal,
        amountPaid: breakdown.amountNow,
        remainingFees: Math.max(breakdown.discountedTotal - breakdown.amountNow, 0),
        transactionId: payment.transactionId,
        firstInstallmentFee,
        remainingInstallments: remainingInstallments.map((inst, i) => ({
          amount: inst.amount,
          feeAmount: inst.feeAmount,
          daysAfter: inst.daysAfter,
          installmentNo: i + 2
        }))
      }
    });
  } catch (error) {
    console.error('Verify course fee error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to verify payment.' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const user = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;

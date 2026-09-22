const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Setup upload directories
const uploadDir = path.join(__dirname, '../uploads');
const certificatesDir = path.join(__dirname, '../uploads/certificates');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(certificatesDir)) fs.mkdirSync(certificatesDir, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (req.path.includes('upload-certificate')) {
      cb(null, certificatesDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, (req.adminId || 'admin') + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Middleware to catch Multer errors
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// --------------------------------------------------------
// PUBLIC / UNAUTHENTICATED ROUTE FALLBACKS
// --------------------------------------------------------

// Public Lead submission
router.post('/leads/public-submit', async (req, res) => {
  try {
    const lead = await db.lead.create({ data: req.body });
    res.json({ success: true, lead });
  } catch (error) {
    console.error("Public lead error:", error);
    res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

// Public Verify Certificate
router.get('/certificate/verify/:certificate_id', async (req, res) => {
  try {
    const cert = await db.certificate.findUnique({
      where: { certificateId: req.params.certificate_id },
      include: { user: true, course: true }
    });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.json({
      valid: cert.status !== 'revoked',
      certificate: {
        certificateId: cert.certificateId,
        studentName: cert.user?.fullName,
        courseName: cert.course?.name || cert.courseName,
        issueDate: cert.issueDate,
        status: cert.status
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify certificate' });
  }
});

// --------------------------------------------------------
// APPLY AUTHENTICATE ADMIN MIDDLEWARE FOR REST OF ROUTES
// --------------------------------------------------------
router.use(authenticateAdmin);

// --------------------------------------------------------
// CRM LEADS
// --------------------------------------------------------
router.get('/leads', async (req, res) => {
  try {
    const leads = await db.lead.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

router.put('/leads/:id', async (req, res) => {
  try {
    const updated = await db.lead.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

router.delete('/leads/:id', async (req, res) => {
  try {
    await db.lead.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// --------------------------------------------------------
// USERS / STUDENTS
// --------------------------------------------------------
router.get('/users', async (req, res) => {
  try {
    const users = await db.user.findMany({ orderBy: { createdAt: 'desc' } });
    const cleanUsers = users.map(({ password, ...rest }) => rest);
    res.json(cleanUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const students = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { enrollments: true }
    });
    const enriched = await Promise.all(students.map(async (s) => {
      const [admission, profile] = await Promise.all([
        db.admission.findFirst({ where: { userId: s.id }, orderBy: { createdAt: 'desc' } }),
        db.studentProfile.findFirst({ where: { userId: s.id } })
      ]);
      const { password, ...rest } = s;
      return {
        ...rest,
        profile: profile || null,
        documents: admission?.documents || null
      };
    }));
    res.json(enriched);
  } catch (error) {
    console.error("Fetch students error:", error);
    res.status(500).json({ error: 'Failed to fetch students data' });
  }
});

// ----------------------------------------------------------------------
// STUDENT PORTFOLIOS — full admin control over student portfolio login
// accounts: list everyone with their documents/payment details, create a
// new login (id + password) directly, edit details/portfolio, edit
// credentials, or delete the account entirely.
//
// Only students who actually have a portfolio login are listed here — i.e.
// registrationFeePaid is true, which covers both a real paid/enrolled
// student and one an admin created directly via the "Create Student Login"
// button (that endpoint also sets registrationFeePaid: true). Plain leads
// that never enrolled are excluded.
// ----------------------------------------------------------------------

router.get('/student-portfolios', async (req, res) => {
  try {
    const students = await db.user.findMany({
      where: { registrationFeePaid: true },
      orderBy: { createdAt: 'desc' },
      include: { enrollments: true }
    });
    const results = await Promise.all(students.map(async (s) => {
      const [admission, profile] = await Promise.all([
        db.admission.findFirst({ where: { userId: s.id }, orderBy: { createdAt: 'desc' } }),
        db.studentProfile.findFirst({ where: { userId: s.id } })
      ]);
      const { password, ...safeUser } = s;
      return {
        ...safeUser,
        city: profile?.city || null,
        portfolioFilled: !!(profile?.portfolio && Object.keys(profile.portfolio).length),
        documentsCount: admission ? Object.keys(admission.documents || {}).length : 0,
        hasApplicationForm: !!admission?.applicationFormPdfUrl,
      };
    }));
    res.json(results);
  } catch (error) {
    console.error('Fetch student portfolios error:', error);
    res.status(500).json({ error: 'Failed to fetch student portfolios' });
  }
});

router.get('/student-portfolios/:id', async (req, res) => {
  try {
    const user = await db.user.findUnique({ where: { id: req.params.id }, include: { enrollments: true } });
    if (!user) return res.status(404).json({ error: 'Student not found' });
    const [admission, profile] = await Promise.all([
      db.admission.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      db.studentProfile.findFirst({ where: { userId: user.id } })
    ]);
    const { password, ...safeUser } = user;
    const { passwordHash, ...safeAdmission } = admission || {};
    res.json({ ...safeUser, admission: admission ? safeAdmission : null, profile: profile || null });
  } catch (error) {
    console.error('Fetch student portfolio detail error:', error);
    res.status(500).json({ error: 'Failed to fetch student details.' });
  }
});

router.post('/student-portfolios', async (req, res) => {
  try {
    const { fullName, email, phone, password, registeredCourse, studentId: customStudentId } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existingEmail = await db.user.findFirst({ where: { email } });
    if (existingEmail) return res.status(409).json({ error: 'A student with this email already exists.' });

    const { generateStudentId } = require('./auth');
    const studentId = customStudentId?.trim() || await generateStudentId(fullName);
    const existingId = await db.user.findFirst({ where: { studentId } });
    if (existingId) return res.status(409).json({ error: 'This Student ID is already in use.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        fullName,
        email,
        phone: phone || '',
        password: hashedPassword,
        role: 'student',
        status: 'active',
        registrationFeePaid: true,
        isRegistrationConfirmed: true,
        registeredCourse: registeredCourse || '',
        studentId,
        createdAt: new Date()
      }
    });
    await db.studentProfile.create({ data: { userId: user.id, portfolio: {} } });

    const { password: _pw, ...safeUser } = user;
    res.status(201).json({ success: true, student: safeUser });
  } catch (error) {
    console.error('Create student portfolio error:', error);
    res.status(500).json({ error: 'Failed to create student account.' });
  }
});

router.put('/student-portfolios/:id', async (req, res) => {
  try {
    const { fullName, phone, registeredCourse, status, portfolio, city } = req.body;
    const userData = {};
    if (fullName !== undefined) userData.fullName = fullName;
    if (phone !== undefined) userData.phone = phone;
    if (registeredCourse !== undefined) userData.registeredCourse = registeredCourse;
    if (status !== undefined) userData.status = status;

    let user = Object.keys(userData).length
      ? await db.user.update({ where: { id: req.params.id }, data: userData })
      : await db.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Student not found' });

    if (portfolio !== undefined || city !== undefined) {
      const profileData = {};
      if (portfolio !== undefined) profileData.portfolio = portfolio;
      if (city !== undefined) profileData.city = city;
      await db.studentProfile.upsert({
        where: { userId: req.params.id },
        update: profileData,
        create: { userId: req.params.id, ...profileData }
      });
    }

    const { password, ...safeUser } = user;
    res.json({ success: true, student: safeUser });
  } catch (error) {
    console.error('Update student portfolio error:', error);
    res.status(500).json({ error: 'Failed to update student.' });
  }
});

router.put('/student-portfolios/:id/credentials', async (req, res) => {
  try {
    const { email, studentId, newPassword } = req.body;
    const data = {};

    if (email) {
      const conflict = await db.user.findFirst({ where: { email } });
      if (conflict && conflict.id !== req.params.id) {
        return res.status(409).json({ error: 'This email is already used by another account.' });
      }
      data.email = email;
    }
    if (studentId) {
      const conflict = await db.user.findFirst({ where: { studentId } });
      if (conflict && conflict.id !== req.params.id) {
        return res.status(409).json({ error: 'This Student ID is already in use.' });
      }
      data.studentId = studentId;
    }
    if (newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      data.password = await bcrypt.hash(newPassword, 10);
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'Nothing to update. Provide email, studentId, and/or newPassword.' });
    }

    const updated = await db.user.update({ where: { id: req.params.id }, data });
    const { password, ...safeUser } = updated;
    res.json({ success: true, student: safeUser });
  } catch (error) {
    console.error('Update student credentials error:', error);
    res.status(500).json({ error: 'Failed to update credentials.' });
  }
});

router.delete('/student-portfolios/:id', async (req, res) => {
  try {
    await db.studentProfile.deleteMany({ where: { userId: req.params.id } });
    await db.enrollment.deleteMany({ where: { userId: req.params.id } });
    await db.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete student portfolio error:', error);
    res.status(500).json({ error: 'Failed to delete student.' });
  }
});

router.post('/users/manual', async (req, res) => {
  try {
    const { email, password, fullName, phone, registeredCourse } = req.body;
    const hashedPassword = await bcrypt.hash(password || '123456', 10);
    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName,
        phone,
        registeredCourse,
        status: 'active',
        createdAt: new Date()
      }
    });
    const { password: _, ...cleanUser } = user;
    res.status(201).json(cleanUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user manually' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const updated = await db.user.update({
      where: { id: req.params.id },
      data: req.body
    });
    const { password, ...cleanUpdated } = updated;
    res.json(cleanUpdated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await db.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/users/:id/credentials', async (req, res) => {
  try {
    const { email, password } = req.body;
    const data = {};
    if (email) data.email = email;
    if (password) data.password = await bcrypt.hash(password, 10);
    const updated = await db.user.update({
      where: { id: req.params.id },
      data
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update credentials' });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.user.update({
      where: { id: req.params.id },
      data: { password: hashedPassword }
    });
    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.post('/confirm-registration/:userId', async (req, res) => {
  try {
    const user = await db.user.update({
      where: { id: req.params.userId },
      data: { registrationFeePaid: true }
    });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm registration' });
  }
});

router.post('/verify-registration/:userId', async (req, res) => {
  try {
    const user = await db.user.update({
      where: { id: req.params.userId },
      data: { registrationFeePaid: true }
    });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify registration' });
  }
});

// --------------------------------------------------------
// COURSES
// --------------------------------------------------------
router.get('/courses', async (req, res) => {
  try {
    const catalog = await db.course.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(catalog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const { name, description, duration, fees, syllabus, brochureUrl, applicationFormUrl, deliveryMode, batchStartDate, paymentPlan } = req.body;
    const course = await db.course.create({
      data: {
        name,
        description,
        duration,
        fees: fees ? parseFloat(fees) : null,
        syllabus,
        brochureUrl,
        applicationFormUrl,
        deliveryMode,
        batchStartDate,
        paymentPlan,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      }
    });
    res.json(course);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create course' });
  }
});

router.put('/courses/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.fees) data.fees = parseFloat(data.fees);
    delete data.id;
    const course = await db.course.update({
      where: { id: req.params.id },
      data
    });
    res.json(course);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update course' });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    await db.course.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// --------------------------------------------------------
// COUPONS
// --------------------------------------------------------
router.get('/coupons', async (req, res) => {
  try {
    const coupons = await db.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(coupons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

router.post('/coupons', async (req, res) => {
  try {
    const { code, discountPercent, maxUses, expiryDate, isActive } = req.body;
    if (!code || !discountPercent) return res.status(400).json({ error: 'Code and discount percentage are required' });

    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await db.coupon.findFirst({ where: { code: normalizedCode } });
    if (existing) return res.status(409).json({ error: 'A coupon with this code already exists' });

    const coupon = await db.coupon.create({
      data: {
        code: normalizedCode,
        discountPercent: parseFloat(discountPercent),
        maxUses: maxUses ? parseInt(maxUses, 10) : null,
        usedCount: 0,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        isActive: isActive !== undefined ? isActive : true
      }
    });
    res.status(201).json(coupon);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

router.put('/coupons/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.discountPercent !== undefined) data.discountPercent = parseFloat(data.discountPercent);
    if (data.maxUses !== undefined) data.maxUses = data.maxUses ? parseInt(data.maxUses, 10) : null;
    if (data.expiryDate !== undefined) data.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    if (data.code) data.code = String(data.code).trim().toUpperCase();
    delete data.id;
    const coupon = await db.coupon.update({ where: { id: req.params.id }, data });
    res.json(coupon);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    await db.coupon.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

router.post('/upload-brochure', uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No brochure file uploaded' });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload brochure' });
  }
});

router.patch('/courses/:id/media', async (req, res) => {
  try {
    const data = {};
    if (req.body.youtubeUrl !== undefined) data.youtubeUrl = req.body.youtubeUrl;
    if (req.body.brochureUrl) data.brochureUrl = req.body.brochureUrl;
    const course = await db.course.update({ where: { id: req.params.id }, data });
    res.json({ success: true, course });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update course media' });
  }
});

// --------------------------------------------------------
// BATCHES
// --------------------------------------------------------
router.get('/batches', async (req, res) => {
  try {
    const batches = await db.batch.findMany({
      include: {
        course: true,
        enrollments: true,
        batchMentors: {
          include: {
            mentor: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(batches);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

router.post('/batches', async (req, res) => {
  try {
    const { courseId, batchName, startDate, endDate, classTime } = req.body;
    const batch = await db.batch.create({
      data: {
        courseId,
        batchName,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        classTime,
        storageType: 'local'
      }
    });
    res.json(batch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create batch' });
  }
});

router.delete('/batches/:id', async (req, res) => {
  try {
    await db.batch.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete batch' });
  }
});

router.put('/batches/:id/dates', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const data = {};
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    const batch = await db.batch.update({
      where: { id: req.params.id },
      data
    });
    res.json(batch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update batch dates' });
  }
});

router.put('/batches/:id', async (req, res) => {
  try {
    const { courseId, batchName, startDate, endDate, classTime } = req.body;
    const data = {};
    if (courseId !== undefined) data.courseId = courseId;
    if (batchName !== undefined) data.batchName = batchName;
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (classTime !== undefined) data.classTime = classTime;

    const batch = await db.batch.update({
      where: { id: req.params.id },
      data
    });
    res.json(batch);
  } catch (error) {
    console.error('Error updating batch:', error);
    res.status(500).json({ error: 'Failed to update batch details' });
  }
});

router.post('/assign-batch', async (req, res) => {
  try {
    const { user_id, batch_id } = req.body;
    const activeEnrollment = await db.enrollment.findFirst({
      where: { userId: user_id },
      orderBy: { createdAt: 'desc' }
    });
    if (!activeEnrollment) return res.status(404).json({ error: 'Enrollment not found' });
    const updated = await db.enrollment.update({
      where: { id: activeEnrollment.id },
      data: { batchId: batch_id }
    });
    res.json({ success: true, enrollment: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign batch' });
  }
});

// --------------------------------------------------------
// CLASS SESSIONS
// --------------------------------------------------------
router.post('/create-class', async (req, res) => {
  try {
    const { batch_id, session_date, session_time, meeting_link, recurrence } = req.body;
    const session = await db.classSession.create({
      data: {
        batchId: batch_id,
        sessionDate: new Date(session_date),
        sessionTime: session_time,
        meetingLink: meeting_link,
        recurrence: recurrence || 'none'
      }
    });
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const sessions = await db.classSession.findMany({
      include: { batch: { include: { course: true } } },
      orderBy: { sessionDate: 'asc' }
    });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.put('/sessions/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.session_date) data.sessionDate = new Date(data.session_date);
    if (data.batch_id) data.batchId = data.batch_id;
    if (data.session_time) data.sessionTime = data.session_time;
    if (data.meeting_link) data.meetingLink = data.meeting_link;
    const session = await db.classSession.update({
      where: { id: req.params.id },
      data
    });
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    await db.classSession.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// --------------------------------------------------------
// ENROLLMENTS
// --------------------------------------------------------
router.get('/enrollments', async (req, res) => {
  try {
    const enrollments = await db.enrollment.findMany({
      include: { user: true, batch: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

router.post('/enrollments/create-for-registered', async (req, res) => {
  const { userId, batchId, courseName } = req.body;
  try {
    const enrollment = await db.enrollment.create({
      data: {
        userId: String(userId),
        batchId: batchId ? String(batchId) : null,
        courseName,
        paymentType: 'full_payment',
        enrollmentStatus: 'enrolled',
        paymentStatus: 'assigned_by_admin',
        amount: 0,
        feesPaid: 0,
        feesPending: 0
      }
    });
    res.json(enrollment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create enrollment' });
  }
});

router.put('/enrollments/:id', async (req, res) => {
  try {
    const updated = await db.enrollment.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update enrollment' });
  }
});

router.post('/confirm-enrollment/:id', async (req, res) => {
  try {
    const updated = await db.enrollment.update({
      where: { id: req.params.id },
      data: { enrollmentStatus: 'confirmed' }
    });
    res.json({ success: true, enrollment: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm enrollment' });
  }
});

router.post('/verify-enrollment/:id', async (req, res) => {
  try {
    const updated = await db.enrollment.update({
      where: { id: req.params.id },
      data: { enrollmentStatus: 'enrolled' }
    });
    res.json({ success: true, enrollment: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify enrollment' });
  }
});

// --------------------------------------------------------
// BLOGS
// --------------------------------------------------------
router.get('/blogs', async (req, res) => {
  try {
    const blogs = await db.blog.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

async function uniqueSlug(base, excludeId) {
  let slug = base;
  let suffix = 1;
  while (true) {
    const existing = await db.blog.findFirst({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

router.post('/blogs', async (req, res) => {
  try {
    const base = slugify(req.body.slug || req.body.title);
    const slug = await uniqueSlug(base);
    const blog = await db.blog.create({ data: { ...req.body, slug } });
    res.status(201).json(blog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create blog' });
  }
});

router.put('/blogs/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.slug || data.title) {
      const base = slugify(data.slug || data.title);
      data.slug = await uniqueSlug(base, req.params.id);
    }
    const blog = await db.blog.update({
      where: { id: req.params.id },
      data
    });
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update blog' });
  }
});

router.delete('/blogs/:id', async (req, res) => {
  try {
    await db.blog.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete blog' });
  }
});

// --------------------------------------------------------
// EVENTS
// --------------------------------------------------------
router.get('/events', async (req, res) => {
  try {
    const events = await db.event.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/events', async (req, res) => {
  try {
    const event = await db.event.create({ data: req.body });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const event = await db.event.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await db.event.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// --------------------------------------------------------
// PLACEMENTS
// --------------------------------------------------------
router.get('/placements', async (req, res) => {
  try {
    const placements = await db.placement.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(placements);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch placements' });
  }
});

router.post('/placements', async (req, res) => {
  try {
    const placement = await db.placement.create({ data: req.body });
    res.status(201).json(placement);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create placement' });
  }
});

router.put('/placements/:id', async (req, res) => {
  try {
    const placement = await db.placement.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(placement);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update placement' });
  }
});

router.delete('/placements/:id', async (req, res) => {
  try {
    await db.placement.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete placement' });
  }
});

// --------------------------------------------------------
// REVIEW VIDEOS
// --------------------------------------------------------
router.get('/review-videos', async (req, res) => {
  try {
    const videos = await db.studentReviewVideo.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch review videos' });
  }
});

router.post('/review-videos', async (req, res) => {
  try {
    const video = await db.studentReviewVideo.create({ data: req.body });
    res.status(201).json(video);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create review video' });
  }
});

router.put('/review-videos/:id', async (req, res) => {
  try {
    const video = await db.studentReviewVideo.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(video);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update review video' });
  }
});

router.delete('/review-videos/:id', async (req, res) => {
  try {
    await db.studentReviewVideo.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete review video' });
  }
});

// --------------------------------------------------------
// TESTIMONIALS
// --------------------------------------------------------
router.get('/testimonials', async (req, res) => {
  try {
    const testimonials = await db.testimonial.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(testimonials);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

router.post('/testimonials', async (req, res) => {
  try {
    const testimonial = await db.testimonial.create({ data: req.body });
    res.status(201).json(testimonial);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create testimonial' });
  }
});

router.put('/testimonials/:id', async (req, res) => {
  try {
    const testimonial = await db.testimonial.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(testimonial);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update testimonial' });
  }
});

router.delete('/testimonials/:id', async (req, res) => {
  try {
    await db.testimonial.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete testimonial' });
  }
});

// --------------------------------------------------------
// PAGE CONTENTS
// --------------------------------------------------------
router.get('/content', async (req, res) => {
  try {
    const contents = await db.pageContent.findMany({});
    res.json(contents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contents' });
  }
});

router.post('/content', async (req, res) => {
  try {
    const { type, content } = req.body;
    const pc = await db.pageContent.upsert({
      where: { type },
      update: { content },
      create: { type, content }
    });
    res.json(pc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save content' });
  }
});

router.post('/upload-image', uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// --------------------------------------------------------
// CERTIFICATES
// --------------------------------------------------------
router.get('/certificates', async (req, res) => {
  try {
    const certs = await db.certificate.findMany({
      include: { user: true, course: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(certs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

router.put('/certificates/:id', async (req, res) => {
  try {
    const updated = await db.certificate.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update certificate status' });
  }
});

router.post('/upload-certificate', uploadMiddleware, async (req, res) => {
  try {
    const { user_id, course_id, certificate_type } = req.body;
    const file = req.file;

    if (!file || !user_id || !course_id || !certificate_type) {
      return res.status(400).json({ error: 'Missing fields or file' });
    }

    const user = await db.user.findUnique({ where: { id: user_id } });
    const course = await db.course.findUnique({ where: { id: course_id } });

    if (!user || !course) return res.status(404).json({ error: 'User or course not found' });

    const certId = `CLIN-${course.slug?.substring(0, 3).toUpperCase() || 'CRS'}-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const newFilename = `${certId}${path.extname(file.originalname)}`;
    const targetPath = path.join(certificatesDir, newFilename);

    fs.renameSync(file.path, targetPath);

    const cert = await db.certificate.create({
      data: {
        userId: user.id,
        courseId: course.id,
        certificateId: certId,
        certificateType: certificate_type,
        issueDate: new Date(),
        fileUrl: `/uploads/certificates/${newFilename}`,
        status: 'generated'
      }
    });

    res.json(cert);
  } catch (error) {
    console.error("Upload certificate error:", error);
    res.status(500).json({ error: 'Failed to upload certificate' });
  }
});

router.post('/generate-certificate', async (req, res) => {
  try {
    const { user_id, course_id, certificate_type } = req.body;
    if (!user_id || !course_id || !certificate_type) return res.status(400).json({ error: 'Missing fields' });

    const user = await db.user.findUnique({ where: { id: user_id } });
    const course = await db.course.findUnique({ where: { id: course_id } });

    if (!user || !course) return res.status(404).json({ error: 'User or course not found' });

    const certId = `CLIN-${course.slug?.substring(0, 3).toUpperCase() || 'CRS'}-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    // Find enrollment to get dates
    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, courseName: course.name }
    });

    const startDate = enrollment?.batch?.startDate || new Date();
    const endDate = enrollment?.batch?.endDate || new Date(new Date().setMonth(new Date().getMonth() + 6));

    const certData = {
      studentName: user.fullName,
      courseName: course.name,
      issueDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      startDate: new Date(startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      endDate: new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      certificateId: certId,
      certificateType: certificate_type
    };

    const { generateCertificatePDF } = require('../utils/pdf_generator');
    const fileUrl = await generateCertificatePDF(certData);

    const cert = await db.certificate.create({
      data: {
        userId: user.id,
        courseId: course.id,
        certificateId: certId,
        certificateType: certificate_type,
        issueDate: new Date(),
        startDate,
        endDate,
        fileUrl,
        status: 'generated'
      }
    });

    res.json(cert);
  } catch (error) {
    console.error("Generate cert error:", error);
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
});

// --------------------------------------------------------
// FINANCE
// --------------------------------------------------------
router.get('/finance/summary', async (req, res) => {
  try {
    const [expenses, incomes, payments] = await Promise.all([
      db.expense.findMany({}),
      db.additionalIncome.findMany({}),
      db.payment.findMany({ where: { paymentStatus: 'paid' } })
    ]);

    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalAdditionalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
    const totalFeesCollected = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      summary: {
        totalFeesCollected,
        totalAdditionalIncome,
        totalExpense,
        netBalance: totalFeesCollected + totalAdditionalIncome - totalExpense
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
});

router.get('/finance/expenses', async (req, res) => {
  try {
    const expenses = await db.expense.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

router.post('/finance/expenses', async (req, res) => {
  try {
    const expense = await db.expense.create({ data: req.body });
    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

router.delete('/finance/expenses/:id', async (req, res) => {
  try {
    await db.expense.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

router.get('/finance/incomes', async (req, res) => {
  try {
    const incomes = await db.additionalIncome.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(incomes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch additional incomes' });
  }
});

router.post('/finance/incomes', async (req, res) => {
  try {
    const income = await db.additionalIncome.create({ data: req.body });
    res.status(201).json(income);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add additional income' });
  }
});

router.delete('/finance/incomes/:id', async (req, res) => {
  try {
    await db.additionalIncome.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete additional income' });
  }
});

// GET /api/admin/mentors-management
router.get('/mentors-management', async (req, res) => {
  try {
    const mentors = await db.admin.findMany({
      where: { role: 'mentor' }
    });

    const enrichedMentors = await Promise.all(mentors.map(async m => {
      const batchMentors = await db.batchMentor.findMany({
        where: { mentorId: m.id }
      });
      
      const activeBatches = [];
      for (const bm of batchMentors) {
        const batch = await db.batch.findUnique({ where: { id: bm.batchId } });
        if (batch && !activeBatches.includes(batch.batchName)) {
          activeBatches.push(batch.batchName);
        }
      }

      const classesTaken = await db.classSession.count({
        where: { mentorId: m.id }
      });

      return {
        id: m.id,
        name: m.name || m.fullName || m.email.split('@')[0],
        email: m.email,
        activeBatches,
        classesTaken,
        cancelledSessions: 0,
        status: activeBatches.length > 0 ? 'Active' : 'Inactive',
        pendingPayout: classesTaken * 1000,
        completedPayout: classesTaken * 4000
      };
    }));

    res.json({ mentors: enrichedMentors });
  } catch (error) {
    console.error('Error fetching mentors-management:', error);
    res.status(500).json({ error: 'Failed to fetch mentor management list' });
  }
});

module.exports = router;

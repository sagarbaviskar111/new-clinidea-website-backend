const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';

const portfolioImageTmpDir = path.join(__dirname, '..', 'uploads', 'tmp');
if (!fs.existsSync(portfolioImageTmpDir)) fs.mkdirSync(portfolioImageTmpDir, { recursive: true });
const portfolioImageUpload = multer({ dest: portfolioImageTmpDir, limits: { fileSize: 8 * 1024 * 1024 } });

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function authenticateStudent(req, res, next) {
  authenticate(req, res, () => {
    if (req.auth.role !== 'student') return res.status(403).json({ error: 'Student access required' });
    req.userId = req.auth.id;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (!['admin', 'superadmin'].includes(req.auth.role)) return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

router.get('/admin/dashboard', authenticateAdmin, async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [totalLeads, leadsToday, recentLeads, totalStudents, totalMentors, activeBatches] = await Promise.all([
      db.lead.count(),
      db.lead.count({ where: { createdAt: { gte: today } } }),
      db.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      db.user.count(),
      db.admin.count({ where: { role: 'mentor' } }),
      db.batch.count()
    ]);
    res.json({ totalLeads, leadsToday, recentLeads, totalStudents, totalMentors, activeBatches });
  } catch (error) {
    console.error('Dashboard API error:', error.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/student/profile', authenticateStudent, async (req, res) => {
  try {
    const [profile, user] = await Promise.all([
      db.studentProfile.findUnique({ where: { userId: req.userId } }),
      db.user.findUnique({ where: { id: req.userId }, select: { fullName: true, email: true, phone: true, registrationFeePaid: true, studentId: true, registeredCourse: true } })
    ]);
    res.json({ profile: profile ? { ...profile, user } : { user } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch student profile' });
  }
});

router.post('/student/profile', authenticateStudent, async (req, res) => {
  try {
    const data = { ...req.body, userId: req.userId };
    delete data.id;
    delete data.user;
    const profile = await db.studentProfile.upsert({ where: { userId: req.userId }, update: data, create: data });
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save student profile' });
  }
});

// Lets a student edit their own core account details (name/email/phone) and,
// optionally, change their login password — the "resume header" info that
// lives on the user record itself rather than in the portfolio JSON blob.
router.put('/student/account', authenticateStudent, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { fullName, email, phone, currentPassword, newPassword } = req.body;

    const user = await db.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'Account not found' });

    const data = {};
    if (fullName !== undefined && fullName.trim()) data.fullName = fullName.trim();
    if (phone !== undefined) data.phone = phone.trim();

    if (email !== undefined && email.trim() && email.trim() !== user.email) {
      const conflict = await db.user.findFirst({ where: { email: email.trim() } });
      if (conflict && conflict.id !== req.userId) {
        return res.status(409).json({ error: 'This email is already in use by another account.' });
      }
      data.email = email.trim();
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Please enter your current password to set a new one.' });
      }
      const matches = await bcrypt.compare(currentPassword, user.password);
      if (!matches) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }
      data.password = await bcrypt.hash(newPassword, 10);
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const updated = await db.user.update({ where: { id: req.userId }, data });
    res.json({
      success: true,
      user: { fullName: updated.fullName, email: updated.email, phone: updated.phone, studentId: updated.studentId, registeredCourse: updated.registeredCourse, registrationFeePaid: updated.registrationFeePaid }
    });
  } catch (error) {
    console.error('Student account update error:', error.message);
    res.status(500).json({ error: 'Failed to update account details.' });
  }
});

// Profile / background image upload for the student's public portfolio page.
// Returns just the hosted URL — the caller merges it into their portfolio JSON
// and saves via POST /student/profile like any other portfolio field.
router.post('/student/portfolio/upload-image', authenticateStudent, portfolioImageUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { uploadToCloudinary } = require('../utils/cloudinary');
    const result = await uploadToCloudinary(req.file.path, 'student_portfolio_images');
    fs.unlink(req.file.path, () => {});
    res.json({ success: true, url: result.url });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    console.error('Portfolio image upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

router.get('/student/documents', authenticateStudent, async (req, res) => {
  try { res.json({ documents: await db.studentDocument.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } }) }); }
  catch (_) { res.status(500).json({ error: 'Failed to fetch documents' }); }
});

router.get('/student/classes', authenticateStudent, async (req, res) => {
  try {
    const enrollments = await db.enrollment.findMany({ where: { userId: req.userId }, include: { batch: { include: { course: true } } }, orderBy: { createdAt: 'desc' } });
    const batchIds = enrollments.map((enrollment) => enrollment.batchId).filter(Boolean);
    const classes = batchIds.length ? await db.classSession.findMany({ where: { batchId: { in: batchIds } }, orderBy: { sessionDate: 'asc' } }) : [];
    const currentBatch = enrollments.find((enrollment) => enrollment.batch);
    res.json({ classes, courseName: currentBatch?.batch?.course?.name || currentBatch?.courseName || null, batchName: currentBatch?.batch?.batchName || null });
  } catch (_) { res.status(500).json({ error: 'Failed to fetch class schedule' }); }
});

router.get('/student/certificates', authenticateStudent, async (req, res) => {
  try { res.json({ certificates: await db.certificate.findMany({ where: { userId: req.userId }, include: { course: true }, orderBy: { createdAt: 'desc' } }) }); }
  catch (_) { res.status(500).json({ error: 'Failed to fetch certificates' }); }
});

router.get('/student/pending-enrollments', authenticateStudent, async (req, res) => {
  try {
    const enrollments = await db.enrollment.findMany({ where: { userId: req.userId, feesPending: { gt: 0 } }, orderBy: { createdAt: 'desc' } });
    res.json({ enrollments });
  } catch (_) { res.status(500).json({ error: 'Failed to fetch pending enrollments' }); }
});

module.exports = router;

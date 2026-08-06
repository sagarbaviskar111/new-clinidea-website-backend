const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';

// Middleware to authenticate Mentor
const authenticateMentor = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.role || (decoded.role !== 'mentor' && decoded.role !== 'superadmin')) {
      return res.status(403).json({ error: 'Access denied: Mentor only' });
    }
    req.mentorId = decoded.adminId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// 1. Mentor Login
router.post('/mentor/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin || (admin.role !== 'mentor' && admin.role !== 'superadmin')) {
      return res.status(401).json({ error: 'Invalid mentor credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign({ adminId: admin.id, email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ success: true, token, mentor: { id: admin.id, email: admin.email, role: admin.role } });
  } catch (error) {
    console.error('Mentor login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// 2. Get Assigned Batches
router.get('/mentor/batches', authenticateMentor, async (req, res) => {
  try {
    let batches = [];
    if (req.mentorId) {
      const admin = await prisma.admin.findUnique({ where: { id: req.mentorId } });
      if (admin && admin.role === 'superadmin') {
        // Superadmin gets all batches
        batches = await prisma.batch.findMany({
          include: { course: true },
          orderBy: { createdAt: 'desc' }
        });
      } else {
        const mappings = await prisma.batchMentor.findMany({
          where: { mentorId: req.mentorId },
          include: { batch: { include: { course: true } } }
        });
        // Deduplicate batches if assigned multiple modules
        const batchMap = new Map();
        mappings.forEach(m => {
          if (!batchMap.has(m.batchId)) batchMap.set(m.batchId, m.batch);
        });
        batches = Array.from(batchMap.values());
      }
    }
    return res.json({ success: true, batches });
  } catch (error) {
    console.error('Error fetching mentor batches:', error);
    return res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// 3. Get Batch Sessions
router.get('/mentor/sessions/:batchId', authenticateMentor, async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId);
    const sessions = await prisma.classSession.findMany({
      where: { batchId },
      orderBy: { sessionDate: 'asc' }
    });
    return res.json({ success: true, sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// 4. Cancel Session
router.post('/mentor/sessions/cancel', authenticateMentor, async (req, res) => {
  const { sessionIds, reason } = req.body;
  try {
    await prisma.classSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { isCancelled: true, cancellationReason: reason, status: 'cancelled' }
    });
    return res.json({ success: true, message: 'Sessions cancelled successfully' });
  } catch (error) {
    console.error('Cancel session error:', error);
    return res.status(500).json({ error: 'Failed to cancel sessions' });
  }
});

// 5. Get Attendance for a session
router.get('/mentor/attendance/:sessionId', authenticateMentor, async (req, res) => {
  try {
    const classSessionId = parseInt(req.params.sessionId);
    const session = await prisma.classSession.findUnique({ where: { id: classSessionId } });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const enrollments = await prisma.enrollment.findMany({
      where: { batchId: session.batchId, enrollmentStatus: 'approved' },
      include: { user: true }
    });

    const attendances = await prisma.attendance.findMany({
      where: { classSessionId }
    });
    
    const attMap = new Map();
    attendances.forEach(a => attMap.set(a.userId, a));

    const data = enrollments.map(enr => {
      const att = attMap.get(enr.userId);
      return {
        userId: enr.userId,
        studentName: enr.user.fullName,
        email: enr.user.email,
        phone: enr.user.phone,
        status: att ? att.status : 'pending',
        absenceReason: att ? att.absenceReason : null
      };
    });

    return res.json({ success: true, attendance: data });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// 6. Mark Attendance
router.post('/mentor/attendance', authenticateMentor, async (req, res) => {
  const { classSessionId, attendanceData } = req.body; // array of { userId, status }
  try {
    for (const record of attendanceData) {
      await prisma.attendance.upsert({
        where: { userId_classSessionId: { userId: record.userId, classSessionId } },
        update: { status: record.status },
        create: { userId: record.userId, classSessionId, status: record.status }
      });
    }
    return res.json({ success: true, message: 'Attendance marked' });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// 7. Create Assignment
router.post('/mentor/assignments', authenticateMentor, async (req, res) => {
  const { batchId, title, description, totalMarks, dueDate } = req.body;
  try {
    const assignment = await prisma.assignment.create({
      data: {
        batchId: parseInt(batchId),
        mentorId: req.mentorId,
        title,
        description,
        totalMarks: parseInt(totalMarks),
        dueDate: new Date(dueDate)
      }
    });
    return res.json({ success: true, assignment });
  } catch (error) {
    console.error('Error creating assignment:', error);
    return res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// 8. Get Assignments
router.get('/mentor/assignments/:batchId', authenticateMentor, async (req, res) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: { batchId: parseInt(req.params.batchId) },
      include: {
        submissions: {
          include: { user: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, assignments });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    return res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// 9. Grade Assignment
router.put('/mentor/assignments/grade/:submissionId', authenticateMentor, async (req, res) => {
  const { marksObtained, mentorFeedback } = req.body;
  try {
    const sub = await prisma.assignmentSubmission.update({
      where: { id: parseInt(req.params.submissionId) },
      data: {
        status: 'graded',
        marksObtained: parseInt(marksObtained),
        mentorFeedback,
        gradedAt: new Date()
      }
    });
    return res.json({ success: true, submission: sub });
  } catch (error) {
    console.error('Error grading assignment:', error);
    return res.status(500).json({ error: 'Failed to grade assignment' });
  }
});

// 10. Create Exam
router.post('/mentor/exams', authenticateMentor, async (req, res) => {
  const { batchId, title, totalMarks, startTime, endTime, questions } = req.body;
  try {
    const exam = await prisma.batchExam.create({
      data: {
        batchId: parseInt(batchId),
        mentorId: req.mentorId,
        title,
        totalMarks: parseInt(totalMarks),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        questions: {
          create: questions.map(q => ({
            type: q.type,
            questionText: q.questionText,
            optionsJson: q.optionsJson ? JSON.stringify(q.optionsJson) : null,
            correctOption: q.correctOption,
            marks: parseInt(q.marks)
          }))
        }
      }
    });
    return res.json({ success: true, exam });
  } catch (error) {
    console.error('Error creating exam:', error);
    return res.status(500).json({ error: 'Failed to create exam' });
  }
});

// 11. Get Exams
router.get('/mentor/exams/:batchId', authenticateMentor, async (req, res) => {
  try {
    const exams = await prisma.batchExam.findMany({
      where: { batchId: parseInt(req.params.batchId) },
      include: {
        questions: true,
        submissions: {
          include: { user: true, answers: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, exams });
  } catch (error) {
    console.error('Error fetching exams:', error);
    return res.status(500).json({ error: 'Failed to fetch exams' });
  }
});

// 12. Grade Exam Written Questions
router.put('/mentor/exams/grade/:answerId', authenticateMentor, async (req, res) => {
  const { marksObtained, mentorRemarks } = req.body;
  try {
    const ans = await prisma.examAnswer.update({
      where: { id: parseInt(req.params.answerId) },
      data: {
        marksObtained: parseInt(marksObtained),
        mentorRemarks
      }
    });
    
    // Auto-update total score on submission
    const allAnswers = await prisma.examAnswer.findMany({
      where: { submissionId: ans.submissionId }
    });
    const total = allAnswers.reduce((sum, a) => sum + (a.marksObtained || 0), 0);
    await prisma.examSubmission.update({
      where: { id: ans.submissionId },
      data: { totalScore: total, status: 'graded', gradedAt: new Date() }
    });

    return res.json({ success: true, answer: ans });
  } catch (error) {
    console.error('Error grading exam answer:', error);
    return res.status(500).json({ error: 'Failed to grade exam answer' });
  }
});

// 13. Upload LMS Material Locally
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'lms_materials');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'lms-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit

router.post('/mentor/lms-upload', authenticateMentor, upload.single('file'), async (req, res) => {
  const { batchId, title, description, category, moduleName } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const fileUrl = `/uploads/lms_materials/${req.file.filename}`;
    let contentType = 'other';
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === '.pdf') contentType = 'pdf';
    else if (['.ppt', '.pptx'].includes(ext)) contentType = 'ppt';
    else if (['.doc', '.docx'].includes(ext)) contentType = 'doc';
    else if (['.mp4', '.mkv', '.avi', '.mov'].includes(ext)) contentType = 'video';
    
    const content = await prisma.lMSContent.create({
      data: {
        batchId: parseInt(batchId),
        title,
        description,
        contentType,
        category: category || 'Study Material',
        moduleName: moduleName || 'General',
        localFileUrl: fileUrl,
      }
    });
    
    return res.json({ success: true, content });
  } catch (error) {
    console.error('LMS upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;

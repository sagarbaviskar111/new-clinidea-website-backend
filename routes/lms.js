const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const { createDriveFolder, uploadToDrive, uploadFileToDrive, deleteDriveFile, findDriveFolder } = require('../utils/googleDrive');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Disk storage for large file uploads to prevent memory issues and Network Errors
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '..', 'uploads', 'temp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'lms-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit for videos

const BASE_DRIVE_FOLDER_ID = process.env.BASE_DRIVE_FOLDER_ID || '1CU5-fkzNx34OcrXYv0JLN4otc3k43WXm';

// --------------------------------------------------------
// ADMIN ROUTES
// --------------------------------------------------------

// Get all mentors
router.get('/admin/mentors', async (req, res) => {
  try {
    const mentors = await prisma.admin.findMany({
      where: { role: 'mentor' },
      select: { id: true, email: true }
    });
    res.json(mentors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// Assign mentor to a module within a batch
router.post('/admin/batches/:batchId/mentors', async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId);
    const { mentorId, moduleName } = req.body;
    
    if (!mentorId || !moduleName) return res.status(400).json({ error: 'mentorId and moduleName are required' });

    const batch = await prisma.batch.findUnique({ where: { id: batchId }, include: { course: true } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    
    let batchFolderId = batch.driveFolderId;
    if (!batchFolderId) {
      const folderName = batch.batchName; // Changed to exactly match the Batch Name as requested
      batchFolderId = await createDriveFolder(folderName, BASE_DRIVE_FOLDER_ID);
      await prisma.batch.update({ where: { id: batchId }, data: { driveFolderId: batchFolderId } });
    }
    
    const moduleFolderId = await createDriveFolder(moduleName, batchFolderId);
    
    await createDriveFolder('Presentations', moduleFolderId);
    await createDriveFolder('Recorded Sessions', moduleFolderId);
    await createDriveFolder('Additional Study Material', moduleFolderId);

    const batchMentor = await prisma.batchMentor.create({
      data: {
        batchId,
        mentorId: parseInt(mentorId),
        moduleName,
        folderId: moduleFolderId
      }
    });

    res.json(batchMentor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign mentor and setup Drive folders. ' + err.message });
  }
});

// Initialize Google Drive folder for a batch
router.post('/admin/batches/:batchId/init-drive', async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId }, include: { course: true } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (batch.driveFolderId) return res.status(400).json({ error: 'Drive folder already exists' });

    const folderName = `${batch.course.name} - ${batch.batchName} (Batch ID: ${batch.id})`;
    const folderId = await createDriveFolder(folderName, BASE_DRIVE_FOLDER_ID);

    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: { driveFolderId: folderId }
    });

    res.json(updatedBatch);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to initialize Drive folder: ' + err.message });
  }
});

// --------------------------------------------------------
// MENTOR ROUTES
// --------------------------------------------------------

// Middleware to authenticate Mentor
const authenticateMentor = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-clinidea-key');
    req.admin = decoded;
    // Assuming 'role' is in token, or we allow superadmins to act as mentors too
    if (decoded.role !== 'mentor' && decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only mentors can access this' });
    }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get batches assigned to this mentor
router.get('/mentor/batches', authenticateMentor, async (req, res) => {
  try {
    if (req.admin.role === 'superadmin') {
      const batches = await prisma.batch.findMany({
        include: { course: true, _count: { select: { lmsContents: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(batches);
    } else {
      const mappings = await prisma.batchMentor.findMany({
        where: { mentorId: req.admin.adminId },
        include: { batch: { include: { course: true } } }
      });
      const batches = mappings.map(m => ({
        ...m.batch,
        moduleName: m.moduleName,
        folderId: m.folderId
      }));
      res.json(batches);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assigned batches' });
  }
});

// Get content for a specific batch (Mentor view)
router.get('/mentor/batches/:batchId/content', authenticateMentor, async (req, res) => {
  try {
    const contents = await prisma.lMSContent.findMany({
      where: { batchId: parseInt(req.params.batchId) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(contents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// Upload content to Google Drive and map to batch
router.post('/mentor/batches/:batchId/content', authenticateMentor, upload.single('file'), async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId);
    const { title, description, folderType } = req.body; // folderType: 'Presentations' or 'Additional Study Material'
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const batchMentor = await prisma.batchMentor.findFirst({
      where: { batchId, mentorId: req.admin.adminId }
    });
    
    if (!batchMentor && req.admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'You are not assigned to this batch' });
    }

    let targetFolderId = null;
    let moduleName = 'General';

    if (batchMentor) {
      moduleName = batchMentor.moduleName;
      const subFolderName = folderType || 'Additional Study Material';
      targetFolderId = await findDriveFolder(subFolderName, batchMentor.folderId);
      if (!targetFolderId) targetFolderId = batchMentor.folderId; // fallback
    } else {
      // Superadmin fallback
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      targetFolderId = batch.driveFolderId;
    }

    if (!targetFolderId) return res.status(400).json({ error: 'Drive folder not initialized for this module/batch' });

    // Handle Duplicate Naming
    let finalTitle = title;
    let counter = 1;
    while (await prisma.lMSContent.findFirst({ where: { batchId, title: finalTitle } })) {
      finalTitle = `${title} (${counter})`;
      counter++;
    }

    // Determine extension for filename in drive
    const ext = path.extname(file.originalname);
    const driveFileName = ext ? `${finalTitle}${ext}` : file.originalname;

    // Upload to Drive
    let driveResult;
    try {
      driveResult = await uploadFileToDrive(file.path, driveFileName, file.mimetype, targetFolderId);
    } finally {
      if (file && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    // Determine content type
    let contentType = 'doc';
    if (file.mimetype.includes('video')) contentType = 'video';
    else if (file.mimetype.includes('pdf')) contentType = 'pdf';
    else if (file.mimetype.includes('presentation') || file.mimetype.includes('powerpoint')) contentType = 'ppt';

    // Save metadata to database
    const content = await prisma.lMSContent.create({
      data: {
        batchId,
        title: finalTitle,
        description,
        contentType,
        category: folderType || 'Additional Study Material',
        moduleName,
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink
      }
    });

    res.status(201).json(content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload content' });
  }
});

// Finish recording and upload to Drive directly
router.post('/mentor/live/finish-recording', authenticateMentor, upload.single('video'), async (req, res) => {
  try {
    const { batchId, title } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const batchMentor = await prisma.batchMentor.findFirst({
      where: { batchId: parseInt(batchId), mentorId: req.admin.adminId }
    });

    let driveFolderId = null;
    let moduleName = 'Live Sessions';

    if (batchMentor) {
      moduleName = batchMentor.moduleName;
      driveFolderId = await findDriveFolder('Recorded Sessions', batchMentor.folderId);
      if (!driveFolderId) driveFolderId = batchMentor.folderId; // fallback
    } else {
      const batch = await prisma.batch.findUnique({ where: { id: parseInt(batchId) } });
      if (!batch) return res.status(404).json({ error: 'Batch not found' });
      driveFolderId = batch.driveFolderId;
      if (!driveFolderId) {
        const folderName = `${batch.batchName} Recordings (Batch ID: ${batch.id})`;
        driveFolderId = await createDriveFolder(folderName, BASE_DRIVE_FOLDER_ID);
        await prisma.batch.update({ where: { id: parseInt(batchId) }, data: { driveFolderId } });
      }
    }
    
    const dateObj = new Date();
    const ddmmyyyy = `${String(dateObj.getDate()).padStart(2, '0')}${String(dateObj.getMonth() + 1).padStart(2, '0')}${dateObj.getFullYear()}`;
    
    let baseTitle = title || `Live_Class`;
    let finalTitle = baseTitle;
    let driveFileName = `${baseTitle}_${ddmmyyyy}`;
    
    let counter = 1;
    while (await prisma.lMSContent.findFirst({ where: { batchId: parseInt(batchId), title: finalTitle } })) {
      finalTitle = `${baseTitle} (${counter})`;
      driveFileName = `${baseTitle}_${ddmmyyyy}_${counter}`;
      counter++;
    }

    driveFileName = `${driveFileName.replace(/\s+/g, '_')}.webm`;
    
    // Upload to Drive
    let driveResult;
    try {
      driveResult = await uploadFileToDrive(file.path, driveFileName, file.mimetype || 'video/webm', driveFolderId);
    } finally {
      if (file && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    // Create LMS content
    const content = await prisma.lMSContent.create({
      data: {
        batchId: parseInt(batchId),
        title: finalTitle,
        description: 'Auto-recorded session',
        contentType: 'video',
        moduleName: 'Live Sessions',
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink
      }
    });

    res.json({ success: true, content });
  } catch (err) {
    console.error("Finish recording error:", err);
    res.status(500).json({ error: 'Failed to process recording' });
  }
});

// Edit content
router.put('/mentor/content/:contentId', authenticateMentor, async (req, res) => {
  try {
    const { title, moduleName } = req.body;
    const content = await prisma.lMSContent.update({
      where: { id: parseInt(req.params.contentId) },
      data: { title, moduleName }
    });
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update content' });
  }
});

// Direct Delete Content (No approval required, deletes from Drive and Database instantly!)
router.delete('/mentor/content/:contentId', authenticateMentor, async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    const content = await prisma.lMSContent.findUnique({
      where: { id: contentId }
    });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // 1. Delete the file from Google Drive if it exists
    if (content.driveFileId) {
      try {
        await deleteDriveFile(content.driveFileId);
      } catch (driveErr) {
        console.error("Failed to delete file from Google Drive:", driveErr);
      }
    }

    // 2. Delete the record from database
    await prisma.lMSContent.delete({
      where: { id: contentId }
    });

    res.json({ success: true, message: 'Content deleted completely from Google Drive and database' });
  } catch (err) {
    console.error("Direct delete error:", err);
    res.status(500).json({ error: 'Failed to delete content directly' });
  }
});

// Request to delete content
router.post('/mentor/content/:contentId/request-delete', authenticateMentor, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required' });

    const content = await prisma.lMSContent.findUnique({ where: { id: parseInt(req.params.contentId) } });
    if (!content) return res.status(404).json({ error: 'Content not found' });

    const deleteRequest = await prisma.contentDeleteRequest.create({
      data: {
        contentId: content.id,
        mentorId: req.admin.adminId,
        reason: reason
      }
    });
    res.json({ success: true, deleteRequest });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit delete request' });
  }
});

// --------------------------------------------------------
// ADMIN LMS MANAGEMENT
// --------------------------------------------------------

router.get('/admin/lms/delete-requests', async (req, res) => {
  // Ideally protect with authenticateAdmin, but using same router for simplicity or ensure admin auth
  try {
    const requests = await prisma.contentDeleteRequest.findMany({
      where: { status: 'pending' },
      include: {
        content: true,
        mentor: { select: { email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch delete requests' });
  }
});

router.put('/admin/lms/delete-requests/:id/approve', async (req, res) => {
  try {
    const request = await prisma.contentDeleteRequest.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { content: true }
    });
    
    if (!request || request.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid or already processed request' });
    }

    // Delete from Drive
    if (request.content.driveFileId) {
      await deleteDriveFile(request.content.driveFileId);
    }

    // Delete from DB
    await prisma.lMSContent.delete({ where: { id: request.content.id } });
    
    // Update request status
    const updated = await prisma.contentDeleteRequest.update({
      where: { id: request.id },
      data: { status: 'approved' }
    });

    res.json({ success: true, updated });
  } catch (err) {
    console.error("Delete approve error:", err);
    res.status(500).json({ error: 'Failed to approve delete request' });
  }
});

router.put('/admin/lms/delete-requests/:id/reject', async (req, res) => {
  try {
    const updated = await prisma.contentDeleteRequest.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'rejected' }
    });
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject delete request' });
  }
});

// --------------------------------------------------------
// STUDENT ROUTES
// --------------------------------------------------------

// Middleware to authenticate Student
const authenticateStudent = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-clinidea-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get content for student's enrolled batches
router.get('/student/content', authenticateStudent, async (req, res) => {
  try {
    // 1. Find all active enrollments for this student
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.id, enrollmentStatus: { in: ['enrolled', 'active', 'completed', 'confirmed', 'registered'] } },
      select: { batchId: true, courseName: true, batch: { select: { batchName: true } } }
    });

    const batchIds = enrollments.map(e => e.batchId).filter(id => id !== null);

    if (batchIds.length === 0) {
      return res.json([]);
    }

    // 2. Fetch all content for these batches
    const contents = await prisma.lMSContent.findMany({
      where: { batchId: { in: batchIds } },
      orderBy: [
        { moduleName: 'asc' },
        { createdAt: 'asc' }
      ],
      include: { batch: { select: { batchName: true, course: { select: { name: true } } } } }
    });

    const enrolledBatchesData = enrollments
      .filter(e => e.batchId !== null)
      .map(e => ({ 
        id: e.batchId, 
        name: e.batch?.batchName || 'Unnamed Batch',
        courseName: e.courseName || 'Clinical Research & Pharmacovigilance'
      }));

    res.json({ contents, enrolledBatches: enrolledBatchesData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch student content', details: err.message });
  }
});

// --------------------------------------------------------
// LIVE CLASS & NOTIFICATION ROUTES
// --------------------------------------------------------

// Schedule a live session (or multiple if recurring)
router.post('/mentor/schedule-session', authenticateMentor, async (req, res) => {
  try {
    const { batchId, title, sessionTime, startDate, endDate, isRecurring, recurrenceType } = req.body;
    if (!batchId || !sessionTime || !startDate) return res.status(400).json({ error: 'Missing required fields' });

    let sessions = [];
    let currentDate = new Date(startDate);
    let lastDate = isRecurring && endDate ? new Date(endDate) : new Date(startDate);

    // Safety limit to avoid infinite loops (max 365 days)
    const MAX_DAYS = 365;
    let daysCount = 0;

    while (currentDate <= lastDate && daysCount < MAX_DAYS) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
      
      // Skip weekends (Saturday and Sunday) only for recurring schedules
      if (!isRecurring || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
        sessions.push({
          batchId: parseInt(batchId),
          title: title || 'Live Class',
          sessionDate: new Date(currentDate),
          sessionTime,
          status: 'upcoming',
          mentorId: req.admin.adminId
        });
      }

      if (!isRecurring) break;
      
      if (recurrenceType === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else { // default daily
        currentDate.setDate(currentDate.getDate() + 1);
      }
      daysCount++;
    }

    const createdSessions = await prisma.$transaction(
      sessions.map(s => prisma.classSession.create({ data: s }))
    );

    res.status(201).json({ message: 'Sessions scheduled successfully', count: createdSessions.length });
  } catch (err) {
    console.error('Schedule Error:', err);
    res.status(500).json({ error: 'Failed to schedule sessions' });
  }
});

// Go Live: Update session status and send notifications
router.post('/mentor/session/:id/live', authenticateMentor, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const session = await prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'live' },
      include: { batch: { include: { enrollments: true } } }
    });

    // Notify all enrolled students
    if (session.batch && session.batch.enrollments) {
      const notifications = session.batch.enrollments.map(e => ({
        userId: e.userId,
        title: '🔴 Live Session Started',
        message: `Your class "${session.title}" has started. Join now!`
      }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
      }
    }

    res.json(session);
  } catch (err) {
    console.error('Go Live Error:', err);
    res.status(500).json({ error: 'Failed to go live' });
  }
});


// Get Unread Notifications
router.get('/student/notifications', authenticateStudent, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.userId, isRead: false },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark Notifications as Read
router.put('/student/notifications/read', authenticateStudent, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, isRead: false },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Get Live/Upcoming Sessions for Student Dashboard
router.get('/student/live-sessions', authenticateStudent, async (req, res) => {
  try {
    // Get user enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.userId },
      select: { batchId: true }
    });
    const batchIds = enrollments.map(e => e.batchId).filter(id => id !== null);

        const sessions = await prisma.classSession.findMany({
      where: { 
        batchId: { in: batchIds },
        status: { in: ['upcoming', 'live'] } // exclude completed
      },
      orderBy: [
        { status: 'asc' }, // 'live' comes before 'upcoming' alphabetically, but we can sort client side
        { sessionDate: 'asc' }
      ]
    });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live sessions' });
  }
});

// Get Live Sessions for a specific batch (Mentor View)
router.get('/mentor/batches/:batchId/live-sessions', authenticateMentor, async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId);
    const sessions = await prisma.classSession.findMany({
      where: { batchId },
      orderBy: { sessionDate: 'asc' }
    });
    res.json(sessions);
  } catch (err) {
    console.error("Mentor fetch live sessions error:", err);
    res.status(500).json({ error: 'Failed to fetch live sessions' });
  }
});

module.exports = router;

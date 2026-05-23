require('dotenv').config();
const express = require('express');
const compression = require('compression');
const apicache = require('apicache');
const cors = require('cors');
const { signPdfCryptographically } = require('./utils/signPdf');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const archiver = require('archiver');
const qrcode = require('qrcode');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { generateReceiptPDF } = require('./utils/pdf_generator');
const { createDriveFolder } = require('./utils/googleDrive');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

// Twilio Setup
const twilio = require('twilio');
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

// Compression and Security Hardening
app.use(compression());
app.use(helmet({
  crossOriginResourcePolicy: false // Allow serving images/files cross-origin if needed
}));

// Rate limiting for general API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Strict Rate Limiting for Admin Login
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 failed requests per windowMs
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' }
});

app.use(cors({
  origin: true, // Allow all origins dynamically
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json());

// URL Rewrite Middleware for Nginx reverse proxy stripping '/api' prefix
app.use((req, res, next) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
    req.url = '/api' + req.url;
  }
  next();
});

app.use('/api/', apiLimiter);

app.use('/uploads/certificates', express.static(path.join(__dirname, 'uploads', 'certificates')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Determine a safe prefix (userId may not be defined for all routes)
    const prefix = req.userId || 'upload';
    cb(null, prefix + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, and PDF are permitted."));
    }
  }
});

// Middleware to catch Multer errors (like size limit) gracefully
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// Nodemailer config
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: parseInt(process.env.EMAIL_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify SMTP connection on startup
transporter.verify(function (error, success) {
  if (error) {
    console.error("SMTP Connection Error:", error);
  } else {
    console.log("SMTP Server is successfully configured and ready to send emails.");
  }
});

// Auto-seed Admin securely
async function seedAdmin() {
  const adminPassword = await bcrypt.hash('PharmaTalentHub@2024', 10);
  
  // Delete legacy admin emails if they exist to keep the system clean
  try {
    await prisma.admin.deleteMany({
      where: {
        email: {
          in: ['Admin@clinidea.in', 'Counsellor@clinidea.in']
        }
      }
    });
  } catch (err) {
    console.error('Legacy admin cleanup skipped/failed:', err.message);
  }

  const adminsToSeed = [
    { email: 'admin@clinidea.in', role: 'superadmin' },
    { email: 'studentcoordinator@clinidea.in', role: 'lead_manager' },
    { email: 'cr@clinidea.in', role: 'mentor' },
    { email: 'pv@clinidea.in', role: 'mentor' },
    { email: 'cdm@clinidea.in', role: 'mentor' },
    { email: 'ra@clinidea.in', role: 'mentor' },
    { email: 'mw@clinidea.in', role: 'mentor' },
    { email: 'mc@clinidea.in', role: 'mentor' }
  ];

  for (const item of adminsToSeed) {
    const exists = await prisma.admin.findUnique({ where: { email: item.email } });
    if (!exists) {
      await prisma.admin.create({
        data: {
          email: item.email,
          password: adminPassword,
          role: item.role
        }
      });
      console.log(`Admin account ${item.email} created as ${item.role}.`);
    } else {
      await prisma.admin.update({
        where: { email: item.email },
        data: {
          password: adminPassword,
          role: item.role
        }
      });
      console.log(`Admin account ${item.email} updated as ${item.role}.`);
    }
  }
}
seedAdmin().catch(console.error);

// Auth Middleware
const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Critical Security Update: Verify the admin still exists in DB
    const admin = await prisma.admin.findUnique({ where: { id: decoded.adminId } });
    if (!admin) {
      return res.status(401).json({ error: 'Admin account has been disabled or deleted.' });
    }

    req.adminId = decoded.adminId;
    req.adminRole = decoded.role;
    
    // RBAC for lead_manager
    if (req.adminRole === 'lead_manager') {
      const allowedPrefixes = [
        '/api/admin/leads',
        '/api/admin/dashboard',
        '/api/admin/documents',
        '/api/events',
        '/api/admin/events'
      ];
      // Use req.url instead of req.originalUrl because of the rewrite middleware
      const isAllowed = allowedPrefixes.some(prefix => req.url.startsWith(prefix));
      if (!isAllowed) {
        return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
      }
      
      // Block write operations on events for lead_manager
      if (req.url.startsWith('/api/admin/events') && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to modify events.' });
      }
    }

    // RBAC for mentor
    if (req.adminRole === 'mentor') {
      const allowedPrefixes = [
        '/api/admin/sessions',
        '/api/admin/create-class',
        '/api/admin/batches',
        '/api/admin/attendance',
        '/api/admin/dashboard',
        '/api/mentor',
        '/api/sessions'
      ];
      const isAllowed = allowedPrefixes.some(prefix => req.url.startsWith(prefix));
      if (!isAllowed) {
        return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
      }
    }
    
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Admin Audit Middleware
const auditLogMiddleware = async (req, res, next) => {
  res.on('finish', async () => {
    if (req.adminId && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      try {
        let safePayload = { ...req.body };
        // Redact sensitive fields if any
        if (safePayload.password) safePayload.password = '[REDACTED]';
        
        await prisma.adminAuditLog.create({
          data: {
            adminId: req.adminId,
            action: req.method,
            endpoint: req.originalUrl,
            payload: JSON.stringify(safePayload)
          }
        });
      } catch (err) {
        console.error("Failed to write audit log:", err);
      }
    }
  });
  next();
};

// Admin Login (Must be before global authenticateAdmin middleware)
app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input format' });
  }

  try {
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    
    // Admin login attempt email logic removed as per user request

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Issue token
    const token = jwt.sign({ adminId: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, role: admin.role });
  } catch (error) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.use('/api/admin', auditLogMiddleware);
// const hrDatabaseRoutes = require('./routes/hrDatabase');
const hrCampaignRoutes = require('./routes/hrCampaigns');
// const hrDashboardRoutes = require('./routes/hrDashboard');
const lmsRoutes = require('./routes/lms');
const quizRoutes = require('./routes/quiz');

// app.use('/api/admin', hrDatabaseRoutes);
app.use('/api/admin', authenticateAdmin, hrCampaignRoutes);
// app.use('/api/admin', hrDashboardRoutes);
app.use('/api', lmsRoutes);
app.use('/api', quizRoutes);

// --------
// PUBLIC
// --------

// Cache all public responses for 5 minutes
const cache = apicache.middleware;

app.get('/api/admissionopen', cache('5 minutes'), (req, res) => res.json({}));
app.get('/api/eventbanner', cache('5 minutes'), (req, res) => res.json({}));
app.get('/api/studentsimg', cache('5 minutes'), (req, res) => res.json([]));

// Zod schema for lead validation
const leadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone number is required"),
  email: z.string().email("Invalid email address"),
  course_interest: z.string().min(1, "Course interest is required"),
  message: z.string().optional(),
});

app.post('/api/leads', async (req, res) => {
  try {
    const parsedData = leadSchema.parse(req.body);

    const existingLead = await prisma.lead.findFirst({
      where: {
        OR: [
          { email: parsedData.email },
          { phone: parsedData.phone }
        ]
      }
    });

    if (existingLead) {
      return res.status(409).json({ error: "An enquiry with this email or phone number already exists." });
    }

    const { course_interest, ...rest } = parsedData;
    const newLead = await prisma.lead.create({
      data: {
        ...rest,
        courseInterest: course_interest
      },
    });

    // Fire & forget emails using emailService
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const emailService = require('./utils/emailService');
      await emailService.sendEnquiryThankYou(newLead);
    }

    return res.status(201).json({ success: true, lead: newLead });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error("Error creating lead:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --------
// ADMIN
// --------

// ==========================================
// 8. CERTIFICATES & VERIFICATION API
// ==========================================

// Verify Certificate (Public Endpoint)
app.get('/api/certificates/verify/:id', async (req, res) => {
  try {
    const cert = await prisma.certificate.findUnique({
      where: { certificateId: req.params.id },
      include: {
        user: { select: { fullName: true, email: true } },
        course: { select: { name: true } }
      }
    });

    if (!cert) return res.status(404).json({ error: 'Certificate not found or invalid' });

    res.json({
      studentName: cert.user.fullName,
      courseName: cert.course.name,
      certificateId: cert.certificateId,
      issueDate: cert.issueDate,
      startDate: cert.startDate,
      endDate: cert.endDate,
      status: cert.status,
      fileUrl: cert.fileUrl
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: 'Verification service error' });
  }
});

// Admin Bulk Generate Certificates
app.post('/api/admin/generate-certificate/batch', authenticateAdmin, async (req, res) => {
  const { batchId } = req.body;
  
  if (!batchId) return res.status(400).json({ error: 'Batch ID is required' });

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: parseInt(batchId) },
      include: { 
        course: true,
        enrollments: {
          include: { user: true }
        }
      }
    });

    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const generatedCerts = [];
    
    // Start processing students in batch
    for (const enrollment of batch.enrollments) {
      if (enrollment.enrollmentStatus !== 'enrolled') continue;

      const user = enrollment.user;
      
      // Check if certificate already exists
      const existingCert = await prisma.certificate.findFirst({
        where: { userId: user.id, batchId: batch.id }
      });
      if (existingCert) continue; // Skip existing

      const certId = `CLIN-${batch.course.slug.substring(0,3).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      const issueDateObj = new Date();
      const issueDateStr = issueDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      
      let startDateObj = batch.startDate ? new Date(batch.startDate) : new Date();
      let endDateObj = new Date(startDateObj);
      endDateObj.setMonth(endDateObj.getMonth() + 6); // Add 6 months
      
      const startDateStr = startDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const endDateStr = endDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

      const certData = {
        studentName: user.fullName,
        courseName: batch.course.name,
        issueDate: issueDateStr,
        startDate: startDateStr,
        endDate: endDateStr,
        certificateId: certId,
        certificateType: 'completion'
      };

      const fileUrl = await generateCertificatePDF(certData);

      const cert = await prisma.certificate.create({
        data: {
          userId: user.id,
          courseId: batch.courseId,
          batchId: batch.id,
          certificateType: 'completion',
          certificateId: certId,
          issueDate: issueDateObj,
          startDate: batch.startDate,
          endDate: batch.endDate,
          fileUrl: fileUrl,
          status: 'generated'
        }
      });
      
      generatedCerts.push(cert);

      // Email the certificate
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Your Certificate of Completion: ${batch.course.name}`,
        html: `
          <h3>Congratulations ${user.fullName}!</h3>
          <p>You have successfully completed the <strong>${batch.course.name}</strong> program.</p>
          <p>Please find attached your official Certificate of Completion.</p>
          <p>You can also verify your certificate online at anytime by scanning the QR code on the certificate or visiting:<br>
          <a href="https://clinidea.in/verify/${certId}">https://clinidea.in/verify/${certId}</a></p>
          <br>
          <p>Best Regards,<br>Clinidea Education Team</p>
        `,
        attachments: [{
          filename: `${certId}.pdf`,
          path: path.join(__dirname, fileUrl)
        }]
      };
      
      transporter.sendMail(mailOptions).catch(err => console.error("Certificate email failed:", err));
    }

    res.json({ message: `Successfully generated ${generatedCerts.length} certificates. Emails are being sent out.`, count: generatedCerts.length });

  } catch (error) {
    console.error("Bulk Generation Error:", error);
    res.status(500).json({ error: 'Server error during batch generation' });
  }
});

// Login route moved up to fix auth middleware bug

app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const totalLeads = await prisma.lead.count();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leadsToday = await prisma.lead.count({
      where: {
        createdAt: { gte: today }
      }
    });

    const recentLeads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    return res.json({
      totalLeads,
      leadsToday,
      recentLeads
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

app.get('/api/admin/documents/:filename', authenticateAdmin, (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "File binary not located on filesystem." });
  }
});

app.put('/api/admin/documents/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updated = await prisma.studentDocument.update({
      where: { id: parseInt(id) },
      data: { status }
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to apply validation flag." });
  }
});

app.get('/api/admin/leads', authenticateAdmin, async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.json(leads);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

app.put('/api/admin/leads/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  try {
    const updated = await prisma.lead.update({
      where: { id: parseInt(id) },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes })
      }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update lead' });
  }
});

app.delete('/api/admin/leads/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.lead.delete({
      where: { id: parseInt(id) }
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// --------
// STUDENT AUTH
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    const cleanUsers = users.map(({ password, ...rest }) => rest);
    return res.json(cleanUsers);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/students', authenticateAdmin, async (req, res) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'student' },
      include: {
        profile: true,
        enrollments: {
          orderBy: { createdAt: 'desc' }
        },
        documents: {
          orderBy: { uploadedAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Remove passwords
    const cleanStudents = students.map(({ password, ...rest }) => rest);
    return res.json(cleanStudents);
  } catch (error) {
    console.error("Fetch students error:", error);
    return res.status(500).json({ error: 'Failed to fetch students data' });
  }
});

app.put('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, registrationFeePaid } = req.body;
  
  try {
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (registrationFeePaid !== undefined) updateData.registrationFeePaid = registrationFeePaid;

    const updated = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    const { password, ...cleanUpdated } = updated;
    return res.json(cleanUpdated);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/api/admin/users/:id/credentials', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { newEmail, newPassword } = req.body;
  
  const updateData = {};
  if (newEmail) {
    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing && existing.id !== parseInt(id)) {
      return res.status(400).json({ error: 'Email already in use by another user' });
    }
    updateData.email = newEmail;
  }
  
  if (newPassword) {
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    updateData.password = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No data provided to update' });
  }

  try {
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    return res.json({ success: true, message: 'Credentials updated successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update credentials' });
  }
});

// Backward compatibility or existing UI code
app.post('/api/admin/users/:id/reset-password', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { password: hashedPassword }
    });
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({
      where: { id: parseInt(id) }
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.get('/api/admin/payments', authenticateAdmin, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      include: { user: { select: { fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(enrollments);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch payment records' });
  }
});

app.put('/api/admin/payments/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  // Overridable fields
  const { paymentStatus, enrollmentStatus } = req.body;
  try {
    const updated = await prisma.enrollment.update({
      where: { id: parseInt(id) },
      data: {
        ...(paymentStatus && { paymentStatus }),
        ...(enrollmentStatus && { enrollmentStatus })
      },
      include: { user: { select: { fullName: true, email: true, phone: true } } }
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update payment override' });
  }
});

app.post('/api/admin/confirm-registration/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const receiptNo = 'REG-' + Date.now();
    const pdfUrl = await generateReceiptPDF({
      receiptNo,
      studentName: user.fullName,
      paymentId: 'REG-FEE',
      mobileNo: user.phone,
      email: user.email,
      course: 'Seat Booking Registration',
      method: 'One-Time',
      paymentMode: 'UPI/Bank Transfer',
      totalFees: 500,
      feesPaid: 500,
      feesPending: 0
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        registrationFeePaid: true,
        isRegistrationConfirmed: true,
        registrationReceiptUrl: pdfUrl
      }
    });

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Registration Payment Confirmed - Clinidea",
        html: `<h3>Hello ${user.fullName},</h3>
               <p>Your registration payment of ₹500 has been successfully verified.</p>
               <p>Please find your official payment receipt attached.</p>
               <p>Best regards,<br/>The Clinidea Education Team</p>`,
        attachments: [{ filename: 'Receipt.pdf', path: path.join(__dirname, pdfUrl) }]
      };
      transporter.sendMail(mailOptions).catch(err => console.error("Reg Receipt email failed:", err));
    }

    return res.json({ success: true, message: 'Registration confirmed', pdfUrl });
  } catch (err) {
    console.error("Confirm Reg Error:", err);
    return res.status(500).json({ error: 'Failed to confirm registration' });
  }
});

app.post('/api/admin/confirm-enrollment/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await prisma.enrollment.findUnique({ 
      where: { id: parseInt(id) },
      include: { user: true }
    });
    
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

    let nextDate = null;
    if (enrollment.installmentCount > 1) {
      const date = new Date();
      date.setMonth(date.getMonth() + 2);
      nextDate = date;
    }

    const receiptNo = 'ENR-' + Date.now();
    const pdfUrl = await generateReceiptPDF({
      receiptNo,
      studentName: enrollment.user.fullName,
      paymentId: enrollment.transactionId || 'N/A',
      mobileNo: enrollment.user.phone,
      email: enrollment.user.email,
      course: enrollment.courseName,
      method: enrollment.paymentType === 'installment' ? 'Installment' : 'One-Time',
      paymentMode: 'UPI/Bank Transfer',
      totalFees: enrollment.totalFees,
      feesPaid: enrollment.feesPaid,
      feesPending: enrollment.feesPending,
      installments: enrollment.installmentCount
    });

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        paymentStatus: enrollment.feesPending <= 0 ? 'completed' : 'partial',
        enrollmentStatus: 'active',
        nextInstallmentDate: nextDate
      }
    });

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
        to: enrollment.user.email,
        subject: "Enrollment Payment Confirmed - Clinidea",
        html: `<h3>Hello ${enrollment.user.fullName},</h3>
               <p>Your enrollment payment for ${enrollment.courseName} has been successfully verified.</p>
               <p>Please find your official payment receipt attached.</p>
               <p>Best regards,<br/>The Clinidea Education Team</p>`,
        attachments: [{ filename: 'Receipt.pdf', path: path.join(__dirname, pdfUrl) }]
      };
      transporter.sendMail(mailOptions).catch(err => console.error("Enroll Receipt email failed:", err));
    }

    return res.json({ success: true, message: 'Enrollment confirmed', pdfUrl });
  } catch (err) {
    console.error("Confirm Enroll Error:", err);
    return res.status(500).json({ error: 'Failed to confirm enrollment' });
  }
});

app.get('/api/admin/enrollments', authenticateAdmin, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      include: { 
        user: { select: { fullName: true, email: true, phone: true } },
        batch: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(enrollments);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch academic enrollments' });
  }
});

app.post('/api/admin/enrollments/create-for-registered', authenticateAdmin, async (req, res) => {
  const { userId, batchId, courseName } = req.body;
  try {
    const enrollment = await prisma.enrollment.create({
      data: {
        userId: parseInt(userId),
        batchId: parseInt(batchId),
        courseName,
        paymentType: 'full_payment',
        enrollmentStatus: 'enrolled',
        paymentStatus: 'assigned_by_admin',
        amount: 0,
        feesPaid: 0,
        feesPending: 0 
      },
      include: { user: true }
    });
    return res.json(enrollment);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create enrollment' });
  }
});

app.put('/api/admin/enrollments/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { enrollmentStatus, batchId } = req.body;
  try {
    if (batchId !== undefined && batchId !== null) {
      // Enforce 30-student limit per batch
      const currentEnrollment = await prisma.enrollment.findUnique({ where: { id: parseInt(id) } });
      if (currentEnrollment && currentEnrollment.batchId !== parseInt(batchId)) {
        const batchStudentCount = await prisma.enrollment.count({
          where: { batchId: parseInt(batchId), enrollmentStatus: { in: ['enrolled', 'active', 'completed'] } }
        });
        if (batchStudentCount >= 30) {
          return res.status(400).json({ error: 'This batch has reached its maximum capacity of 30 students.' });
        }
      }
    }

    const updated = await prisma.enrollment.update({
      where: { id: parseInt(id) },
      data: {
        ...(enrollmentStatus && { enrollmentStatus }),
        ...(batchId !== undefined && { batchId: batchId ? parseInt(batchId) : null })
      },
      include: { 
        user: { select: { fullName: true, email: true, phone: true } },
        batch: true
      }
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update academic status' });
  }
});

// --------
// ADMIN CERTIFICATES
// --------

app.get('/api/admin/certificates', authenticateAdmin, async (req, res) => {
  try {
    const certificates = await prisma.certificate.findMany({
      include: {
        user: { select: { fullName: true, email: true } },
        course: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(certificates);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

app.put('/api/admin/certificates/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updated = await prisma.certificate.update({
      where: { id: parseInt(id) },
      data: { status },
      include: {
        user: { select: { fullName: true, email: true } },
        course: { select: { name: true } }
      }
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update certificate status' });
  }
});

app.post('/api/admin/upload-certificate', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    const { user_id, course_id, certificate_type } = req.body;
    const file = req.file;

    if (!file || !user_id || !course_id || !certificate_type) {
      return res.status(400).json({ error: "Missing required fields or file." });
    }

    const user = await prisma.user.findUnique({ where: { id: parseInt(user_id) } });
    const course = await prisma.course.findUnique({ where: { id: parseInt(course_id) } });

    if (!user || !course) {
      return res.status(404).json({ error: "User or Course not found." });
    }

    const certId = `CLIN-${course.slug.substring(0,3).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    // file is uploaded by multer into uploads/ directory (or depending on multer config).
    // Let's copy it to uploads/certificates if it's not already there.
    const fs = require('fs');
    const path = require('path');
    const ext = path.extname(file.originalname);
    const newFilename = `${certId}${ext}`;
    const targetPath = path.join(__dirname, 'uploads', 'certificates', newFilename);
    
    // Create dir if not exists
    if (!fs.existsSync(path.join(__dirname, 'uploads', 'certificates'))) {
      fs.mkdirSync(path.join(__dirname, 'uploads', 'certificates'), { recursive: true });
    }

    // Move file
    fs.renameSync(file.path, targetPath);

    const fileUrl = `/uploads/certificates/${newFilename}`;

    const newCert = await prisma.certificate.create({
      data: {
        userId: user.id,
        courseId: course.id,
        certificateId: certId,
        certificateType: certificate_type,
        issueDate: new Date(),
        expiryDate: null,
        fileUrl: fileUrl,
        status: 'generated'
      }
    });

    res.json(newCert);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload certificate" });
  }
});

app.post('/api/admin/generate-certificate', authenticateAdmin, async (req, res) => {
  try {
    const { user_id, course_id, certificate_type } = req.body;
    
    if (!user_id || !course_id || !certificate_type) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Fetch user and course
    const user = await prisma.user.findUnique({ where: { id: parseInt(user_id) } });
    const course = await prisma.course.findUnique({ where: { id: parseInt(course_id) } });

    if (!user || !course) {
      return res.status(404).json({ error: "User or Course not found." });
    }

    // Generate Certificate ID
    const certId = `CLIN-${course.slug.substring(0,3).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const issueDateObj = new Date();
    const issueDateStr = issueDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Try to find if user has a batch for this course to get start/end dates
    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: user.id, courseName: course.name, enrollmentStatus: 'enrolled' },
      include: { batch: true }
    });

    let startDateObj = enrollment?.batch?.startDate ? new Date(enrollment.batch.startDate) : new Date();
    let endDateObj = new Date(startDateObj);
    endDateObj.setMonth(endDateObj.getMonth() + 6); // Add 6 months

    const startDateStr = startDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const endDateStr = endDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const certData = {
      studentName: user.fullName,
      courseName: course.name,
      issueDate: issueDateStr,
      startDate: startDateStr,
      endDate: endDateStr,
      certificateId: certId,
      certificateType: certificate_type
    };

    const { generateCertificatePDF } = require('./utils/pdf_generator');
    const fileUrl = await generateCertificatePDF(certData);

    // Store in DB
    const certificate = await prisma.certificate.create({
      data: {
        userId: user.id,
        courseId: course.id,
        certificateType: certificate_type,
        certificateId: certId,
        issueDate: issueDateObj,
        startDate: enrollment?.batch?.startDate || null,
        endDate: enrollment?.batch?.endDate || null,
        batchId: enrollment?.batch?.id || null,
        fileUrl: fileUrl,
        status: 'generated'
      }
    });

    // Send email notification
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && user.email) {
      const downloadLink = (process.env.BASE_URL || 'http://localhost:5000') + fileUrl;
      const verifyUrl = `https://clinidea.in/verify/${certId}`;
      const mailOptions = {
        from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Your Certificate is Ready",
        html: `<h3>Congratulations ${user.fullName}!</h3>
               <p>Your official ${course.name} certificate has been successfully generated.</p>
               <p><strong>Certificate ID:</strong> ${certId}</p>
               <p>You can verify your certificate online at anytime by scanning the QR code on the certificate or visiting:<br>
               <a href="${verifyUrl}">${verifyUrl}</a></p>
               <p>You can view and download your PDF certificate here: <a href="${downloadLink}">Download Certificate</a></p>
               <br/>
               <p>Best regards,<br/>The Clinidea Education Team</p>`,
        attachments: [{ filename: `${certId}.pdf`, path: path.join(__dirname, fileUrl) }]
      };
      transporter.sendMail(mailOptions).catch(err => console.error("Certificate email failed:", err));
    }

    return res.status(201).json({ success: true, certificate });
  } catch (error) {
    console.error("Certificate generation error:", error);
    return res.status(500).json({ error: "Failed to generate certificate." });
  }
});

app.post('/api/admin/generate-certificates-bulk', authenticateAdmin, async (req, res) => {
  try {
    const { user_ids, course_id, certificate_type } = req.body;
    
    if (!Array.isArray(user_ids) || user_ids.length === 0 || !course_id || !certificate_type) {
      return res.status(400).json({ error: "Missing required fields or invalid user_ids." });
    }

    const templateMap = {
      gcp: 'gcp-certificate.html',
      advanced: 'advanced-certification.html',
      internship: 'internship-certificate.html'
    };

    if (!templateMap[certificate_type]) {
      return res.status(400).json({ error: "Invalid certificate_type." });
    }

    const course = await prisma.course.findUnique({ where: { id: parseInt(course_id) } });
    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: user_ids.map(id => parseInt(id)) } }
    });

    if (users.length === 0) {
      return res.status(404).json({ error: "No valid users found." });
    }

    const templatePath = path.join(__dirname, 'templates', 'certificates', templateMap[certificate_type]);
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: "Template file not found." });
    }

    const templateHtml = fs.readFileSync(templatePath, 'utf8');

    const certsDir = path.join(__dirname, 'uploads', 'certificates');
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    // Launch browser once for efficiency
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    const generatedCertificates = [];
    const filesToZip = [];

    const issueDateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    for (const user of users) {
      const certId = 'CERT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const verifyUrl = `${process.env.BASE_URL || 'http://localhost:5173'}/verify-certificate/${certId}`;
      const qrCodeDataUrl = await qrcode.toDataURL(verifyUrl, { width: 100, margin: 1 });

      let html = templateHtml.replace(/{{studentName}}/g, user.fullName);
      html = html.replace(/{{courseName}}/g, course.name);
      html = html.replace(/{{issueDate}}/g, issueDateStr);
      html = html.replace(/{{certificateId}}/g, certId);
      html = html.replace(/{{qrCode}}/g, qrCodeDataUrl);

      const filename = `${certId}.pdf`;
      const pdfPath = path.join(certsDir, filename);

      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: pdfPath,
        printBackground: true,
        landscape: true,
        width: '1056px',
        height: '816px',
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
      });

      const fileUrl = `/uploads/certificates/${filename}`;

      const certificate = await prisma.certificate.create({
        data: {
          userId: user.id,
          courseId: course.id,
          certificateType: certificate_type,
          certificateId: certId,
          issueDate: new Date(),
          fileUrl: fileUrl,
          status: 'generated'
        }
      });

      // Send email notification
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS && user.email) {
        const downloadLink = (process.env.BASE_URL || 'http://localhost:5000') + fileUrl;
        const mailOptions = {
          from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: "Your Certificate is Ready",
          html: `<h3>Congratulations ${user.fullName}!</h3>
                 <p>Your official ${course.name} certificate has been successfully generated.</p>
                 <p><strong>Certificate ID:</strong> ${certId}</p>
                 <p>You can view and download your PDF certificate here: <a href="${downloadLink}">Download Certificate</a></p>
                 <br/>
                 <p>Best regards,<br/>The Clinidea Education Team</p>`
        };
        transporter.sendMail(mailOptions).catch(err => console.error("Certificate email failed:", err));
      }

      generatedCertificates.push(certificate);
      filesToZip.push({ path: pdfPath, name: `${user.fullName.replace(/\\s+/g, '_')}_${filename}` });
    }

    await browser.close();

    // Create a zip file
    const zipFilename = `certificates_bulk_${Date.now()}.zip`;
    const zipPath = path.join(certsDir, zipFilename);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      for (const file of filesToZip) {
        archive.file(file.path, { name: file.name });
      }
      archive.finalize();
    });

    const zipUrl = `/uploads/certificates/${zipFilename}`;

    return res.status(201).json({ 
      success: true, 
      count: generatedCertificates.length,
      certificates: generatedCertificates,
      zipUrl: zipUrl
    });

  } catch (error) {
    console.error("Bulk certificate generation error:", error);
    return res.status(500).json({ error: "Failed to generate certificates in bulk." });
  }
});

// --------

const registerSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { phone: data.phone }]
      }
    });

    let user;
    const hashedPassword = await bcrypt.hash(data.password, 10);

    if (existingUser) {
      if (existingUser.registrationFeePaid || existingUser.registrationScreenshot) {
        return res.status(409).json({ error: 'A user with this email or phone already exists.' });
      } else {
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            fullName: data.full_name,
            password: hashedPassword,
            status: 'active'
          }
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          fullName: data.full_name,
          phone: data.phone,
          email: data.email,
          password: hashedPassword,
          role: 'student',
          status: 'active'
        }
      });
    }

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
        to: data.email,
        subject: "Welcome to Clinidea!",
        html: `<h3>Hello ${data.full_name},</h3>
               <p>Welcome to Clinidea Education! Your student account has been successfully created.</p>
               <p><strong>Next Steps:</strong></p>
               <ul>
                 <li>Log into your secure dashboard.</li>
                 <li>Explore our premium clinical research courses.</li>
                 <li>Begin your educational journey!</li>
               </ul>
               <br/>
               <p>Best regards,<br/>The Clinidea Education Team</p>`
      };
      transporter.sendMail(mailOptions).catch(err => console.error("Welcome email failed:", err));
    }

    // Strip password from response for security
    const { password: _, ...userWithoutPassword } = user;

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({ success: true, user: userWithoutPassword, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error("Registration error:", error);
    return res.status(500).json({ error: 'Registration failed. Please try again later.' });
  }
});



const loginSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required"),
  password: z.string().min(1, "Password is required")
});

// Basic memory-based rate limiting map for login
const loginRateLimiter = new Map();

app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const rateLimitWindow = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 50;

    // Optional Rate Limiting
    if (loginRateLimiter.has(ip)) {
      const attempts = loginRateLimiter.get(ip);
      const recentAttempts = attempts.filter(time => now - time < rateLimitWindow);
      if (recentAttempts.length >= maxAttempts) {
        return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
      }
      recentAttempts.push(now);
      loginRateLimiter.set(ip, recentAttempts);
    } else {
      loginRateLimiter.set(ip, [now]);
    }

    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.identifier },
          { phone: data.identifier }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account disabled. Please contact administration.' });
    }

    if (!user.registrationFeePaid && !user.registrationScreenshot) {
      return res.status(403).json({ error: 'Registration incomplete. Please register again and complete the 500 INR payment.' });
    } else if (!user.registrationFeePaid && user.registrationScreenshot) {
      return res.status(403).json({ error: 'Your registration payment is currently under verification by admin. Please wait.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    // Reset rate limits on successful login
    loginRateLimiter.delete(ip);

    return res.json({ success: true, token, user: userWithoutPassword });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error("Login error:", error);
    return res.status(500).json({ error: 'Login failed. Please try again later.' });
  }
});

// --------
// ENROLLMENTS & PAYMENTS
// --------

// -------- PAYMENT SETTINGS API --------
app.get('/api/public/payment-settings', async (req, res) => {
  try {
    const settings = await prisma.paymentSetting.findFirst();
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("Payment settings GET error:", error);
    return res.status(500).json({ error: "Failed to fetch payment settings." });
  }
});

app.post('/api/admin/payment-settings', authenticateAdmin, uploadMiddleware, async (req, res) => {
  try {
    const { bankName, accountNumber, ifscCode, accountHolder, upiId } = req.body;
    let qrCodeUrl = req.body.qrCodeUrl;
    
    if (req.file) {
      qrCodeUrl = `/uploads/${req.file.filename}`;
    }

    const existing = await prisma.paymentSetting.findFirst();
    let settings;
    if (existing) {
      settings = await prisma.paymentSetting.update({
        where: { id: existing.id },
        data: { bankName, accountNumber, ifscCode, accountHolder, upiId, qrCodeUrl }
      });
    } else {
      settings = await prisma.paymentSetting.create({
        data: { bankName, accountNumber, ifscCode, accountHolder, upiId, qrCodeUrl }
      });
    }

    return res.json({ success: true, settings });
  } catch (error) {
    console.error("Payment settings POST error:", error);
    return res.status(500).json({ error: "Failed to update payment settings." });
  }
});

// -------- ENROLLMENT PAYMENT ENDPOINTS (MANUAL VERIFICATION) --------

const createOrderSchema = z.object({
  course_name: z.string().min(1, "Course name is required"),
  type: z.enum(['seat', 'full', 'installment']).optional().default('seat'),
  transactionId: z.string().min(1, "Transaction ID is required")
});

app.post('/api/enrollment/create-order', authenticateUser, async (req, res) => {
  try {
    const { course_name, type } = req.body;
    const userId = req.userId;

    const existingPaid = await prisma.enrollment.findFirst({
      where: {
        userId: userId,
        courseName: course_name,
        paymentStatus: 'paid'
      }
    });

    if (existingPaid) {
      if (existingPaid.feesPending <= 0) {
        return res.status(409).json({ error: "You are already fully enrolled in this course." });
      } else {
        return res.status(409).json({ error: `You have an active installment plan. Remaining Fees: ₹${existingPaid.feesPending}. Please contact admin to complete your payment.` });
      }
    }

    // Check if there is an existing enrollment (e.g. assigned by admin to a batch)
    let enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: userId,
        courseName: course_name,
        paymentStatus: { in: ['pending', 'assigned_by_admin'] }
      }
    });

    if (!enrollment || enrollment.batchId === null) {
      // Clean up any abandoned pending enrollments for this course so they can try again
      await prisma.enrollment.deleteMany({
        where: {
          userId: userId,
          courseName: course_name,
          paymentStatus: 'pending',
          batchId: null
        }
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const discount = user?.registrationFeePaid ? 500 : 0;

    const course = await prisma.course.findFirst({ where: { name: course_name } });
    const baseFee = course?.fees || 50000;
    
    let amountInINR = 0;
    let paymentTypeConfig = 'full_payment';
    let totalFees = 0;
    let feesPending = 0;

    if (type === 'full') {
      amountInINR = baseFee - discount;
      totalFees = amountInINR;
      feesPending = 0;
    } else {
      paymentTypeConfig = 'installment';
      const surcharge = 2000;
      const installmentAmount = (baseFee + surcharge) / 2;
      amountInINR = installmentAmount - discount;
      feesPending = installmentAmount;
      totalFees = amountInINR + feesPending;
    }

    const options = {
      amount: amountInINR * 100, // Amount in paise
      currency: "INR",
      receipt: "receipt_order_" + Date.now(),
    };

    const order = await razorpayInstance.orders.create(options);
    
    if (enrollment && enrollment.batchId !== null) {
      // Update existing assigned enrollment
      enrollment = await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          paymentType: paymentTypeConfig,
          amount: amountInINR,
          totalFees: totalFees,
          feesPending: feesPending,
          installmentCount: type === 'installment' ? 2 : 1,
          razorpayOrderId: order.id,
          paymentStatus: 'pending'
        }
      });
    } else {
      // Create new pending enrollment entry
      enrollment = await prisma.enrollment.create({
        data: {
          userId: userId,
          courseName: course_name,
          paymentType: paymentTypeConfig,
          amount: amountInINR,
          totalFees: totalFees,
          feesPending: feesPending,
          installmentCount: type === 'installment' ? 2 : 1,
          razorpayOrderId: order.id,
          paymentStatus: 'pending',
          enrollmentStatus: 'pending'
        }
      });
    }

    return res.json({ 
      success: true, 
      orderId: order.id, 
      amount: order.amount,
      enrollmentId: enrollment.id 
    });

  } catch (error) {
    console.error("Order creation error:", error);
    return res.status(500).json({ error: "Failed to create enrollment order." });
  }
});

app.post('/api/enrollment/verify-payment', authenticateUser, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, enrollmentId } = req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
                                  .update(body.toString())
                                  .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { user: true }
    });

    if (!enrollment) {
      return res.status(404).json({ error: "Enrollment not found." });
    }

    const payment = await prisma.payment.create({
      data: {
        userId: req.userId,
        courseName: enrollment.courseName,
        amount: enrollment.amount,
        paymentMethod: "razorpay",
        paymentStatus: "completed",
        transactionId: razorpay_payment_id
      }
    });

    const updated = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        paymentStatus: "paid",
        enrollmentStatus: "confirmed",
        transactionId: razorpay_payment_id,
        feesPaid: enrollment.amount
      }
    });

    // Automatically set User status to ENROLLED
    await prisma.user.update({
      where: { id: req.userId },
      data: { status: "ENROLLED" }
    });

    // Generate PDF Receipt
    const { generateReceiptPDF } = require('./utils/pdf_generator');
    const pdfUrl = await generateReceiptPDF({
      receiptNo: razorpay_payment_id, // Use transaction ID as receipt number for easy lookup
      studentName: enrollment.user.fullName,
      paymentId: razorpay_payment_id,
      mobileNo: enrollment.user.phone,
      email: enrollment.user.email,
      course: enrollment.courseName,
      method: enrollment.paymentType === 'installment' ? 'Installment' : 'One-Time',
      paymentMode: 'Razorpay',
      totalFees: updated.totalFees,
      feesPaid: updated.feesPaid,
      feesPending: updated.feesPending
    });

    // Send email with receipt
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const emailService = require('./utils/emailService');
      const absolutePdfPath = require('path').join(__dirname, pdfUrl);
      await emailService.sendEnrollmentReceipt(enrollment.user, updated, razorpay_payment_id, absolutePdfPath);
    }

    return res.json({ success: true, message: "Payment verified successfully", enrollment: updated });

  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({ error: "Failed to verify transaction." });
  }
});


// --------
// STUDENT PROFILES
// --------

app.get('/api/student/profile', authenticateUser, async (req, res) => {
  try {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: req.userId },
      include: { user: { select: { fullName: true, email: true, phone: true, registrationFeePaid: true } } }
    });

    return res.json({ profile });
  } catch (err) {
    console.error("Profile GET error:", err);
    return res.status(500).json({ error: "Failed to fetch profile array." });
  }
});

app.post('/api/student/profile', authenticateUser, async (req, res) => {
  try {
    const data = req.body;

    const profile = await prisma.studentProfile.upsert({
      where: { userId: req.userId },
      update: {
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        qualification: data.qualification,
        collegeName: data.collegeName,
        graduationYear: data.graduationYear,
        alternatePhone: data.alternatePhone,
        specialization: data.specialization,
        cgpa: data.cgpa,
        experienceStatus: data.experienceStatus,
        companyName: data.companyName,
        jobRole: data.jobRole,
        totalExperience: data.totalExperience
      },
      create: {
        userId: req.userId,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        qualification: data.qualification,
        collegeName: data.collegeName,
        graduationYear: data.graduationYear,
        alternatePhone: data.alternatePhone,
        specialization: data.specialization,
        cgpa: data.cgpa,
        experienceStatus: data.experienceStatus,
        companyName: data.companyName,
        jobRole: data.jobRole,
        totalExperience: data.totalExperience
      }
    });

    return res.json({ success: true, profile });
  } catch (err) {
    console.error("Profile POST error:", err);
    return res.status(500).json({ error: "Failed to construct and save profile data." });
  }
});

// --------
// STUDENT DOCUMENTS
// --------

app.post('/api/auth/register-payment', authenticateUser, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Payment screenshot is required." });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Update user record with screenshot
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        registrationScreenshot: fileUrl,
        isRegistrationConfirmed: false
      }
    });

    return res.status(200).json({ success: true, message: "Registration payment submitted for review." });
  } catch (error) {
    console.error("Registration payment error:", error);
    return res.status(500).json({ error: "Failed to submit registration payment details." });
  }
});

app.post('/api/auth/register-fee', async (req, res) => {
  try {
    const { full_name, phone, email, password, course, city } = req.body;
    
    // Validate required fields
    if (!full_name || !phone || !email || !password || !course) {
      return res.status(400).json({ error: "All required fields must be filled." });
    }

    const options = {
      amount: 500 * 100, // ₹500 in paise
      currency: "INR",
      receipt: "reg_receipt_" + Date.now(),
    };

    const order = await razorpayInstance.orders.create(options);

    return res.json({ 
      success: true, 
      orderId: order.id, 
      amount: order.amount,
      userDetails: { full_name, phone, email, password, course, city }
    });

  } catch (error) {
    console.error("Registration fee order error:", error);
    return res.status(500).json({ error: "Failed to create registration order." });
  }
});

app.post('/api/auth/verify-registration', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userDetails } = req.body;
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
                                  .update(body.toString())
                                  .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    const { full_name, phone, email, password, course, city } = userDetails;
    const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] }
    });

    let user;
    if (existingUser) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
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
      user = await prisma.user.create({
        data: {
          fullName: full_name,
          phone: phone,
          email: email,
          password: hashedPassword,
          role: 'student',
          status: 'active',
          registrationFeePaid: true,
          isRegistrationConfirmed: true,
          registeredCourse: course
        }
      });
    }

    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: { city: city },
      create: { userId: user.id, city: city }
    });

    // Create Payment Record
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        courseName: 'Registration',
        amount: 500,
        paymentMethod: 'razorpay',
        paymentStatus: 'completed',
        transactionId: razorpay_payment_id
      }
    });

    // Generate PDF
    const { generateRegistrationReceiptPDF } = require('./utils/pdf_generator');
    const paymentData = {
      studentName: user.fullName,
      courseName: 'Registration',
      mobileNo: user.phone,
      email: user.email,
      amountPaid: 500,
      totalFees: 500,
      remainingFees: 0,
      paymentType: 'Online Registration',
      transactionId: payment.transactionId,
      timestamp: new Date()
    };
    const pdfUrl = await generateRegistrationReceiptPDF(paymentData);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { registrationReceiptUrl: pdfUrl }
    });

    // Send Email
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const emailService = require('./utils/emailService');
      const absolutePdfPath = require('path').join(__dirname, pdfUrl);
      await emailService.sendRegistrationReceipt(user, 500, razorpay_payment_id, absolutePdfPath);
    }

    return res.json({ success: true, message: "Registration successful!", user });
  } catch (error) {
    console.error("Submit registration proof error:", error);
    return res.status(500).json({ error: "Failed to submit registration payment details." });
  }
});

// -------- ADMIN VERIFICATION ENDPOINTS --------

app.post('/api/admin/verify-registration/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) }, include: { profile: true } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Update User
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        registrationFeePaid: true,
        isRegistrationConfirmed: true
      }
    });

    // Create Payment Record
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        courseName: 'Registration',
        amount: 500,
        paymentMethod: 'Manual (Verified)',
        paymentStatus: 'success',
        transactionId: `REG-MANUAL-${Date.now()}`,
        fileUrl: user.registrationScreenshot
      }
    });

    // Generate PDF
    const { generateRegistrationReceiptPDF } = require('./utils/pdf_generator');
    const paymentData = {
      studentName: user.fullName,
      courseName: 'Registration',
      mobileNo: user.phone,
      email: user.email,
      amountPaid: 500,
      totalFees: 500,
      remainingFees: 0,
      paymentType: 'Online Registration',
      transactionId: payment.transactionId,
      timestamp: new Date()
    };
    const pdfUrl = await generateRegistrationReceiptPDF(paymentData);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { registrationReceiptUrl: pdfUrl }
    });

    // Send Email
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Registration Verified & Payment Receipt",
        html: `<h3>Hello ${user.fullName},</h3>
               <p>Your manual payment of ₹500 has been verified by the admin. Your registration is now confirmed.</p>
               <p>Please find your official digitally signed payment slip attached to this email.</p>
               <br/><p>Best regards,<br/>The Clinidea Team</p>`,
        attachments: [
          {
            filename: 'Payment_Slip.pdf',
            path: path.join(__dirname, pdfUrl.startsWith('/') ? pdfUrl.substring(1) : pdfUrl)
          }
        ]
      };
      const mailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      mailTransporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));
    }

    return res.json({ success: true, message: "Registration verified and receipt sent." });
  } catch (err) {
    console.error("Verify registration error:", err);
    return res.status(500).json({ error: "Verification failed." });
  }
});

app.post('/api/admin/verify-enrollment/:enrollmentId', authenticateAdmin, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: parseInt(enrollmentId) },
      include: { user: true }
    });
    if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });

    // Update Enrollment
    const updated = await prisma.enrollment.update({
      where: { id: parseInt(enrollmentId) },
      data: {
        paymentStatus: "paid",
        enrollmentStatus: "pending" // Admin still needs to map batch
      }
    });

    // Update Payment
    const paymentRec = await prisma.payment.findFirst({
      where: { transactionId: enrollment.transactionId }
    });

    let finalFileUrl = null;
    if (paymentRec) {
      const { generateEnrollmentReceiptPDF } = require('./utils/pdf_generator');
      const paymentData = {
        studentName: enrollment.user.fullName,
        courseName: updated.courseName,
        amountPaid: updated.amount,
        totalFees: updated.totalFees,
        remainingFees: updated.feesPending,
        transactionId: enrollment.transactionId || paymentRec.transactionId,
        timestamp: new Date()
      };
      try {
        finalFileUrl = await generateEnrollmentReceiptPDF(paymentData);
      } catch (pdfErr) {
        console.error("PDF generation failed:", pdfErr);
      }
      await prisma.payment.update({
        where: { id: paymentRec.id },
        data: { paymentStatus: 'success', fileUrl: finalFileUrl }
      });
    }

    // Send Email
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && enrollment.user) {
      let subject = "Enrollment Payment Verified - Clinidea";
      let htmlContent = `<h3>Hello ${enrollment.user.fullName},</h3>
             <p>Your manual payment of ₹${updated.amount} for the <b>${updated.courseName}</b> course has been verified by the admin.</p>
             <p>You can download your payment receipt here: <a href="${process.env.BASE_URL || 'http://localhost:5000'}${finalFileUrl}">Download Receipt</a></p>
             <p><strong>Next Steps:</strong></p>
             <ul><li>Your student dashboard profile is now fully unlocked.</li></ul>
             <br/><p>Best regards,<br/>The Clinidea Team</p>`;

      const mailOptions = {
        from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
        to: enrollment.user.email,
        subject: subject,
        html: htmlContent
      };
      
      if (finalFileUrl) {
        const fullPdfPath = path.join(__dirname, 'uploads', 'receipts', path.basename(finalFileUrl));
        if (fs.existsSync(fullPdfPath)) {
          mailOptions.attachments = [{ filename: 'Clinidea_Fee_Receipt.pdf', path: fullPdfPath }];
        }
      }
      const mailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      mailTransporter.sendMail(mailOptions).catch(err => console.error("Email failed:", err));
    }

    return res.json({ success: true, message: "Enrollment verified and receipt sent." });
  } catch (err) {
    console.error("Verify enrollment error:", err);
    return res.status(500).json({ error: "Verification failed." });
  }
});


app.post('/api/enrollments/manual-payment', authenticateUser, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Payment screenshot is required." });
    }

    const { courseName, transactionId, paymentType, amount } = req.body;
    
    if (!courseName || !transactionId || !amount) {
      return res.status(400).json({ error: "Missing required payment fields." });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const isRegistrationPaid = user.registrationFeePaid;

    const courseFees = {
      "Clinical Research & Pharmacovigilance": 50000,
      "Clinical Research & Data Management": 50000,
      "Clinical Research, Pharmacovigilance & Data Management": 70000,
      "Clinical Research & Regulatory Affairs": 50000,
      "Clinical Research & Medical Writing": 50000
    };
    
    let baseFee = courseFees[courseName] || 50000;
    let totalFees = baseFee;
    let installmentCount = 1;

    if (paymentType === 'installment') {
       installmentCount = 2;
       totalFees = baseFee + 2000; // 1000 extra per installment
    }
    
    const parsedAmount = parseFloat(amount);
    let feesPaid = parsedAmount;
    if (isRegistrationPaid && paymentType !== 'seat_booking') {
       feesPaid += 500;
    }

    let feesPending = totalFees - feesPaid;
    if (paymentType === 'seat_booking') {
       totalFees = 500;
       feesPending = 500 - feesPaid;
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        userId: req.userId,
        courseName,
        paymentType: paymentType || 'seat_booking',
        amount: parsedAmount,
        paymentStatus: 'pending',
        transactionId,
        paymentScreenshotUrl: fileUrl,
        enrollmentStatus: 'pending',
        totalFees,
        feesPaid,
        feesPending,
        installmentCount,
        installmentNumber: 1
      }
    });

    return res.status(201).json({ success: true, enrollment });
  } catch (error) {
    console.error("Manual payment error:", error);
    return res.status(500).json({ error: "Failed to submit payment details." });
  }
});

app.post('/api/student/upload-document', authenticateUser, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file was successfully attached." });
    }

    const documentType = req.body.document_type;
    const allowedTypes = ['photo', 'id_proof', 'education_certificate', 'resume', 'edu_cert'];

    if (!allowedTypes.includes(documentType)) {
      // Secure local cleanup of orphan file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid document_type parameter." });
    }

    const document = await prisma.studentDocument.create({
      data: {
        userId: req.userId,
        documentType: documentType,
        fileUrl: `/uploads/${req.file.filename}`
      }
    });

    return res.json({ success: true, document });

  } catch (err) {
    console.error("Document upload error:", err);
    return res.status(500).json({ error: "Database or Server Error: " + (err.message || "Failed to secure document.") });
  }
});

app.get('/api/student/documents', authenticateUser, async (req, res) => {
  try {
    const documents = await prisma.studentDocument.findMany({
      where: { userId: req.userId },
      orderBy: { uploadedAt: 'desc' }
    });

    // Crucially mapping out raw fileUrls so they remain fully inaccessible to non-admins as requested
    const safePayload = documents.map(doc => ({
      id: doc.id,
      documentType: doc.documentType,
      uploadedAt: doc.uploadedAt,
      status: "Secured Vault"
    }));

    return res.json({ documents: safePayload });
  } catch (err) {
    console.error("Document fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch document metadata." });
  }
});

// --------
// PUBLIC CERTIFICATE VERIFICATION
// --------

app.get('/api/certificate/verify/:certificate_id', async (req, res) => {
  try {
    const { certificate_id } = req.params;
    const certificate = await prisma.certificate.findUnique({
      where: { certificateId: certificate_id },
      include: {
        user: { select: { fullName: true } },
        course: { select: { name: true } }
      }
    });

    if (!certificate) {
      return res.status(404).json({ error: "Certificate not found or invalid." });
    }

    return res.json({
      valid: certificate.status !== 'revoked',
      certificate: {
        certificateId: certificate.certificateId,
        studentName: certificate.user.fullName,
        courseName: certificate.course.name,
        issueDate: certificate.issueDate,
        status: certificate.status
      }
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({ error: "Failed to verify certificate." });
  }
});

// --------
// STUDENT CERTIFICATES
// --------

app.get('/api/student/certificates', authenticateUser, async (req, res) => {
  try {
    const certificates = await prisma.certificate.findMany({
      where: { userId: req.userId },
      include: { course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ certificates });
  } catch (err) {
    console.error("Certificate fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch certificates." });
  }
});

// --------
// ACADEMIC COURSE STRATEGY (PHASE 5)
// --------

// Public Fetch: All Courses & Embedded Batches
app.get('/api/courses', async (req, res) => {
  try {
    const catalog = await prisma.course.findMany({
      include: { batches: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(catalog);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch master catalog." });
  }
});

// Admin ONLY: Upload Course Brochure Binary
app.post('/api/admin/upload-brochure', authenticateAdmin, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No physical file was routed." });
    // Vault the URL
    return res.json({ success: true, url: `/uploads/${req.file.filename}` });
  } catch (err) {
    return res.status(500).json({ error: "Failed to securely map the brochure binary." });
  }
});

// Admin ONLY: Create Course
app.post('/api/admin/courses', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, duration, fees, syllabus, brochureUrl } = req.body;
    const course = await prisma.course.create({
      data: {
        name,
        description,
        duration,
        fees: fees ? parseFloat(fees) : null,
        syllabus,
        brochureUrl
      }
    });
    return res.json(course);
  } catch (err) {
    return res.status(500).json({ error: "Failed to inject course mapping." });
  }
});

// Admin ONLY: Edit Course
app.put('/api/admin/courses/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    if (updateData.fees) updateData.fees = parseFloat(updateData.fees);
    
    const course = await prisma.course.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    return res.json(course);
  } catch (err) {
    return res.status(500).json({ error: "Failed to process course mutation." });
  }
});

// Admin ONLY: Delete Course
app.delete('/api/admin/courses/:id', authenticateAdmin, async (req, res) => {
  try {
    // Note: Due to relation, Prisma throws if batches are attached unless cascading is set natively
    await prisma.course.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Purging rejected! Active batches may still be inherently tied to this vector." });
  }
});

// --------
// ACADEMIC BATCH STRATEGY
// --------

// Admin ONLY: Fetch Global Batches
app.get('/api/admin/batches', authenticateAdmin, async (req, res) => {
  try {
    const batches = await prisma.batch.findMany({
      include: {
        course: true,
        enrollments: { include: { user: true } },
        batchMentors: { include: { mentor: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(batches);
  } catch (err) {
    return res.status(500).json({ error: "Failed to compile batches." });
  }
});

// Admin ONLY: Append New Batch to Course
app.post('/api/admin/batches', authenticateAdmin, async (req, res) => {
  try {
    const { courseId, batchName, startDate, endDate, classTime } = req.body;
    
    // Create Google Drive Folder immediately using EXACTLY the batchName
    const BASE_DRIVE_FOLDER_ID = '1CU5-fkzNx34OcrXYv0JLN4otc3k43WXm';
    let driveFolderId = null;
    try {
      driveFolderId = await createDriveFolder(batchName, BASE_DRIVE_FOLDER_ID);
    } catch (driveErr) {
      console.error("Failed to create drive folder during batch creation:", driveErr);
      // We log but don't fail the batch creation if drive fails, to prevent total blockage if oauth fails.
    }

    const batch = await prisma.batch.create({
      data: {
        courseId: parseInt(courseId),
        batchName,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        classTime,
        driveFolderId
      }
    });
    return res.json(batch);
  } catch (err) {
    console.error("Batch Creation Error:", err);
    return res.status(500).json({ error: "Failed to map batch logic." });
  }
});

// Admin ONLY: Delete Batch
app.delete('/api/admin/batches/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.batch.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to purge batch layout." });
  }
});

// Admin ONLY: Assign Student to Batch Matrix
app.post('/api/admin/assign-batch', authenticateAdmin, async (req, res) => {
  const { user_id, batch_id } = req.body;
  try {
    const activeEnrollment = await prisma.enrollment.findFirst({
      where: { userId: parseInt(user_id) },
      orderBy: { createdAt: 'desc' }
    });

    if(!activeEnrollment) {
      return res.status(404).json({ error: "Student has no registered payments/enrollments to bind." });
    }

    const updated = await prisma.enrollment.update({
      where: { id: activeEnrollment.id },
      data: { batchId: parseInt(batch_id) }
    });

    return res.json({ success: true, enrollment: updated });
  } catch (err) {
    console.error("Batch assignment fault:", err);
    return res.status(500).json({ error: "Database rejected the student batch assignment block." });
  }
});

// --------
// CLASS SESSIONS STRATEGY
// --------

// Helper: Process and roll-forward active recurring sessions
const processRecurringSessions = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const recurringSessions = await prisma.classSession.findMany({
      where: {
        recurrence: { in: ['daily', 'weekly'] }
      }
    });

    for (const session of recurringSessions) {
      let sessionDate = new Date(session.sessionDate);
      sessionDate.setHours(0, 0, 0, 0);

      if (sessionDate < today) {
        let nextDate = new Date(session.sessionDate);
        while (nextDate < today) {
          if (session.recurrence === 'daily') {
            nextDate.setDate(nextDate.getDate() + 1);
          } else if (session.recurrence === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
          }
        }
        await prisma.classSession.update({
          where: { id: session.id },
          data: { sessionDate: nextDate }
        });
      }
    }
  } catch (err) {
    console.error("Error processing recurring sessions:", err.message);
  }
};

// Admin ONLY: Append Session to Batch
app.post('/api/admin/create-class', authenticateAdmin, async (req, res) => {
  const { batch_id, session_date, session_time, meeting_link, recurrence } = req.body;
  try {
    const sessionVal = await prisma.classSession.create({
      data: {
        batchId: parseInt(batch_id),
        sessionDate: new Date(session_date),
        sessionTime: session_time,
        meetingLink: meeting_link,
        recurrence: recurrence || 'none'
      }
    });
    return res.json({ success: true, session: sessionVal });
  } catch (err) {
    return res.status(500).json({ error: "Failed to anchor class session securely." });
  }
});

// Admin ONLY: Fetch Global Class Sessions
app.get('/api/admin/sessions', authenticateAdmin, async (req, res) => {
  try {
    await processRecurringSessions();

    const sessions = await prisma.classSession.findMany({
      include: { batch: { include: { course: true } } },
      orderBy: { sessionDate: 'asc' }
    });

    // Only display today's or future sessions (completed ones disappear)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSessions = sessions.filter(session => {
      const sDate = new Date(session.sessionDate);
      sDate.setHours(0, 0, 0, 0);
      return sDate >= today;
    });

    return res.json(activeSessions);
  } catch (err) {
    return res.status(500).json({ error: "Compilation error." });
  }
});

// Admin ONLY: Edit Session
app.put('/api/admin/sessions/:id', authenticateAdmin, async (req, res) => {
  try {
    const { batch_id, session_date, session_time, meeting_link, recurrence, title } = req.body;
    const sessionVal = await prisma.classSession.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(batch_id && { batchId: parseInt(batch_id) }),
        ...(session_date && { sessionDate: new Date(session_date) }),
        ...(session_time && { sessionTime: session_time }),
        ...(meeting_link && { meetingLink: meeting_link }),
        ...(recurrence && { recurrence: recurrence }),
        ...(title !== undefined && { title: title })
      }
    });
    return res.json({ success: true, session: sessionVal });
  } catch (err) {
    return res.status(500).json({ error: "Mutation failed." });
  }
});

// Admin ONLY: Delete Session
app.delete('/api/admin/sessions/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.classSession.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Purging session rejected." });
  }
});

// Any Authenticated Student OR Admin: Fetch Sessions
app.get('/api/sessions/:batchId', authenticateUser, async (req, res) => {
  try {
    await processRecurringSessions();

    const sessionsList = await prisma.classSession.findMany({
      where: { batchId: parseInt(req.params.batchId) },
      orderBy: { sessionDate: 'asc' }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSessionsList = sessionsList.filter(s => {
      const sDate = new Date(s.sessionDate);
      sDate.setHours(0, 0, 0, 0);
      return sDate >= today;
    });

    return res.json(activeSessionsList);
  } catch (err) {
    return res.status(500).json({ error: "Cannot parse session mappings from core." });
  }
});

// Authenticated Student ONLY: Fetch ONLY their active assigned batch schedule
app.get('/api/student/classes', authenticateUser, async (req, res) => {
  try {
    await processRecurringSessions();

    const activeEnrollment = await prisma.enrollment.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: { batch: { include: { course: true } } }
    });

    if (!activeEnrollment || !activeEnrollment.batchId) {
      return res.json({ classes: [], courseName: null });
    }

    const classes = await prisma.classSession.findMany({
      where: { batchId: activeEnrollment.batchId },
      orderBy: { sessionDate: 'asc' }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeClasses = classes.filter(s => {
      const sDate = new Date(s.sessionDate);
      sDate.setHours(0, 0, 0, 0);
      return sDate >= today;
    });

    return res.json({ classes: activeClasses, courseName: activeEnrollment.batch?.course?.name || activeEnrollment.courseName, batchName: activeEnrollment.batch?.batchName });
  } catch (err) {
    console.error("Student classes error:", err);
    return res.status(500).json({ error: "Failed to parse active daily scheduler." });
  }
});
// --------
// ATTENDANCE TRACKING (ADMIN LOOP)
// --------

// Admin ONLY: Fetch active roster and current attendance states for a given session
app.get('/api/admin/attendance/:classSessionId', authenticateAdmin, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.classSessionId);
    
    // Validate session
    const sessionDoc = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        batch: {
          include: { enrollments: { include: { user: true } } }
        },
        attendances: true
      }
    });

    if (!sessionDoc) return res.status(404).json({ error: "Session array void." });

    // Map students in the associated batch & merge with attendance
    const compiledRoster = sessionDoc.batch.enrollments.map(enr => {
      const activeMark = sessionDoc.attendances.find(a => a.userId === enr.userId);
      return {
        userId: enr.userId,
        fullName: enr.user.fullName,
        email: enr.user.email,
        status: activeMark ? activeMark.status : "absent"
      };
    });

    return res.json(compiledRoster);
  } catch (err) {
    return res.status(500).json({ error: "Parse failure on roster compilation." });
  }
});

// Admin ONLY: Mutate Attendance mapping
app.post('/api/admin/attendance', authenticateAdmin, async (req, res) => {
  const { classSessionId, records } = req.body;
  try {
    for (const record of records) {
      await prisma.attendance.upsert({
        where: {
          userId_classSessionId: { userId: parseInt(record.userId), classSessionId: parseInt(classSessionId) }
        },
        update: { status: record.status, markedAt: new Date() },
        create: {
          userId: parseInt(record.userId),
          classSessionId: parseInt(classSessionId),
          status: record.status
        }
      });
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to anchor attendance configurations." });
  }
});
// --------
// CRON DAEMON: CLASS REMINDERS
// --------
// Executes every day at 08:00 AM server time (0 8 * * *)
cron.schedule('0 8 * * *', async () => {
  console.log("CRON: Scanning for active class sessions today...");
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to Start of Day
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activeSessions = await prisma.classSession.findMany({
      where: {
        sessionDate: { gte: today, lt: tomorrow }
      },
      include: {
        batch: {
          include: { 
            course: true,
            enrollments: { include: { user: true } }
          }
        }
      }
    });

    for (const session of activeSessions) {
      if (!session.batch || !session.batch.enrollments) continue;
      
      const courseName = session.batch.course?.name || "Clinidea Masterclass";
      
      for (const enr of session.batch.enrollments) {
         if (!enr.user) continue;
         
         // 1. Send Email Reminder
         const mailOptions = {
           from: `"Clinidea Academic Scheduler" <${process.env.EMAIL_USER}>`,
           to: enr.user.email,
           subject: `Reminder: ${courseName} Class Today!`,
           html: `<h3>Hello ${enr.user.fullName},</h3>
                  <p>Your class for the <b>${session.batch.batchName}</b> batch is scheduled for today at <b>${session.sessionTime}</b>.</p>
                  <br/>
                  ${session.meetingLink ? `<p>Join securely here: <br/><a href="${session.meetingLink}" style="padding:10px 15px;background:#2563eb;color:#fff;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px;">Access Live Portal</a></p>` : `<p>Your meeting link will be updated shortly.</p>`}
                  <br/>
                  <p>Ensure your attendance is marked by the Architect.</p>
                  <p>Best regards,<br/>The Clinidea Education Layer</p>`
         };
         
         transporter.sendMail(mailOptions).catch(e => console.error("Cron Email drop failed for:", enr.user.email));

         // 2. WhatsApp Mock Transmission
         console.log(`[WHATSAPP MOCK] -> Sending to ${enr.user.phone}: "Clinidea Alert: ${courseName} starts at ${session.sessionTime}. Link: ${session.meetingLink || 'Pending'}"`);
      }
    }
  } catch (err) {
    console.error("Cron Engine crashed during session array mapping:", err);
  }
});

// --------
// EVENTS
// --------

app.get('/api/events', async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      include: {
        _count: {
          select: {
            registrations: true,
            quizAttempts: true
          }
        }
      },
      orderBy: { eventDate: 'asc' }
    });
    return res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    return res.status(500).json({ error: "Failed to fetch events" });
  }
});

const eventRegistrationSchema = z.object({
  event_id: z.number().int("Event ID must be an integer"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email address")
});

app.post('/api/events/register', async (req, res) => {
  try {
    const data = eventRegistrationSchema.parse(req.body);

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: data.event_id }
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Prevent duplicate entries
    const existingRegistration = await prisma.eventRegistration.findFirst({
      where: {
        eventId: data.event_id,
        OR: [
          { email: data.email },
          { phone: data.phone }
        ]
      }
    });

    if (existingRegistration) {
      return res.status(409).json({ error: "You are already registered for this event." });
    }

    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: data.event_id,
        name: data.name,
        phone: data.phone,
        email: data.email
      }
    });

    // Integrate with CRM (Create Lead)
    try {
      await prisma.lead.create({
        data: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          courseInterest: event.title,
          source: 'event',
          message: `Registered for event: ${event.title} (${new Date(event.eventDate).toLocaleDateString()})`
        }
      });
    } catch (leadError) {
      console.error("Failed to create CRM lead from event registration:", leadError);
      // We don't throw here to ensure the user's registration still succeeds even if CRM integration fails
    }

    // Send confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: data.email,
      subject: 'Event Registration Confirmed',
      html: `
        <h3>Hi ${data.name},</h3>
        <p>Your registration for <strong>${event.title}</strong> has been successfully confirmed!</p>
        <h4>Event Details:</h4>
        <ul>
          <li><strong>Date:</strong> ${new Date(event.eventDate).toLocaleDateString()}</li>
          <li><strong>Time:</strong> ${event.eventTime}</li>
          ${event.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${event.meetingLink}">${event.meetingLink}</a></li>` : ''}
        </ul>
        <p>We look forward to seeing you there!</p>
        <p>Best regards,<br>Clinidea Education Team</p>
      `
    };
    
    transporter.sendMail(mailOptions).catch(err => console.error('Failed to send event confirmation email:', err));

    // Send WhatsApp Confirmation (Twilio or Mock)
    const waMessage = `Clinidea Alert: Your registration for ${event.title} is confirmed! Date: ${new Date(event.eventDate).toLocaleDateString()}, Time: ${event.eventTime}. Link: ${event.meetingLink || 'Provided later'}`;
    
    if (twilioClient) {
      const recipientPhone = data.phone.startsWith('+') ? data.phone : `+91${data.phone}`;
      twilioClient.messages.create({
        body: waMessage,
        from: TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${recipientPhone}`
      }).then(message => console.log('Twilio WA message sent:', message.sid))
        .catch(err => console.error('Twilio WA error:', err));
    } else {
      console.log(`[WHATSAPP MOCK] -> Sending to ${data.phone}: "${waMessage}"`);
    }

    return res.status(201).json({ success: true, registration });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error("Event registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --------
// ADMIN EVENT MANAGEMENT
// --------

const eventAdminSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  eventType: z.string().min(1, "Event Type is required"),
  eventDate: z.string().min(1, "Event Date is required"),
  eventTime: z.string().min(1, "Event Time is required"),
  durationMinutes: z.union([z.string(), z.number()]).optional(),
  meetingLink: z.string().optional(),
  imageUrl: z.string().optional(),
  youtubeUrl: z.string().optional()
});

app.post('/api/admin/events', authenticateAdmin, async (req, res) => {
  try {
    const data = eventAdminSchema.parse(req.body);
    const eventDate = new Date(data.eventDate);
    
    const newEvent = await prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        eventType: data.eventType,
        eventDate: eventDate,
        eventTime: data.eventTime,
        durationMinutes: data.durationMinutes ? parseInt(data.durationMinutes) : null,
        meetingLink: data.meetingLink,
        imageUrl: data.imageUrl,
        youtubeUrl: data.youtubeUrl
      }
    });
    return res.status(201).json(newEvent);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    return res.status(500).json({ error: "Failed to create event" });
  }
});

app.put('/api/admin/events/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = eventAdminSchema.parse(req.body);
    const eventDate = new Date(data.eventDate);

    const updated = await prisma.event.update({
      where: { id: parseInt(id) },
      data: {
        title: data.title,
        description: data.description,
        eventType: data.eventType,
        eventDate: eventDate,
        eventTime: data.eventTime,
        durationMinutes: data.durationMinutes ? parseInt(data.durationMinutes) : null,
        meetingLink: data.meetingLink,
        imageUrl: data.imageUrl,
        youtubeUrl: data.youtubeUrl
      }
    });
    return res.json(updated);
  } catch (err) {
    console.error("PUT Event Error:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    return res.status(500).json({ error: "Failed to update event" });
  }
});

app.delete('/api/admin/events/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.eventRegistration.deleteMany({
      where: { eventId: parseInt(id) }
    });
    await prisma.event.delete({
      where: { id: parseInt(id) }
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete event error:", err);
    return res.status(500).json({ error: "Failed to delete event" });
  }
});

app.get('/api/admin/events/:id/participants', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const event = await prisma.event.findUnique({
      where: { id: parseInt(id) }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (event.eventType === 'quiz') {
      const attempts = await prisma.quizAttempt.findMany({
        where: { eventId: parseInt(id) },
        orderBy: { startTime: 'desc' }
      });
      // Map QuizAttempt to standard participant structure
      const mapped = attempts.map(att => ({
        id: att.id,
        eventId: att.eventId,
        name: att.name,
        phone: att.phone,
        email: att.email,
        createdAt: att.startTime,
        score: att.score,
        status: att.status,
        qualification: att.qualification,
        location: att.location,
        courseInterest: att.courseInterest
      }));
      return res.json(mapped);
    } else {
      const registrations = await prisma.eventRegistration.findMany({
        where: { eventId: parseInt(id) },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(registrations);
    }
  } catch (err) {
    console.error("Fetch participants error:", err);
    return res.status(500).json({ error: "Failed to fetch participants" });
  }
});


// ======== NEW MODULES & APIS ========

// --- MULTER & IMAGE COMPRESSION ---
const sharp = require('sharp');
const uploadStorage = multer.memoryStorage(); // Use memory to compress before saving
const adminImageUpload = multer({ storage: uploadStorage });

app.post('/api/admin/upload-image', authenticateAdmin, adminImageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  try {
    const filename = `img-${Date.now()}.webp`;
    const outputPath = path.join(__dirname, 'uploads', filename);
    await sharp(req.file.buffer)
      .webp({ quality: 80 })
      .toFile(outputPath);
    return res.json({ url: `/uploads/${filename}` });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Failed to process image' });
  }
});

// --- COURSES ---
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await prisma.course.findMany();
    return res.json(courses);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

app.get('/api/courses/:slug', async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { slug: req.params.slug } });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    return res.json(course);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// Admin Course CRUD
app.post('/api/admin/courses', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, duration, fees, syllabus, brochureUrl, youtubeUrl } = req.body;
    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    // Ensure uniqueness
    const existing = await prisma.course.findUnique({ where: { slug } });
    if (existing) slug += `-${Date.now()}`;

    const course = await prisma.course.create({
      data: { name, slug, description, duration, fees: parseFloat(fees), syllabus, brochureUrl, youtubeUrl }
    });
    return res.status(201).json(course);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create course' });
  }
});

app.put('/api/admin/courses/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, duration, fees, syllabus, brochureUrl, youtubeUrl } = req.body;
    const course = await prisma.course.update({
      where: { id: parseInt(req.params.id) },
      data: { name, description, duration, fees: parseFloat(fees), syllabus, brochureUrl, youtubeUrl }
    });
    return res.json(course);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update course' });
  }
});

// Dedicated Endpoint for Quick Media Assignments
app.patch('/api/admin/courses/:id/media', authenticateAdmin, async (req, res) => {
  try {
    const { youtubeUrl, brochureUrl } = req.body;
    const updateData = {};
    if (youtubeUrl !== undefined) updateData.youtubeUrl = youtubeUrl;
    if (brochureUrl !== undefined) updateData.brochureUrl = brochureUrl;

    const course = await prisma.course.update({
      where: { id: parseInt(req.params.id) },
      data: updateData
    });
    return res.json(course);
  } catch (err) {
    console.error("Error in PATCH /api/admin/courses/:id/media:", err);
    return res.status(500).json({ error: 'Failed to assign media to course' });
  }
});

app.delete('/api/admin/courses/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.course.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete course' });
  }
});

// --- CMS ---
app.get('/api/content/:page', async (req, res) => {
  try {
    const content = await prisma.pageContent.findMany({
      where: { page: req.params.page, isActive: true },
      orderBy: { order: 'asc' }
    });
    return res.json(content);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch CMS content' });
  }
});

app.get('/api/admin/content/:page', authenticateAdmin, async (req, res) => {
  try {
    const content = await prisma.pageContent.findMany({
      where: { page: req.params.page },
      orderBy: { order: 'asc' }
    });
    return res.json(content);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch CMS content' });
  }
});

app.get('/api/admin/content', authenticateAdmin, async (req, res) => {
  try {
    const content = await prisma.pageContent.findMany({
      orderBy: [
        { page: 'asc' },
        { order: 'asc' }
      ]
    });
    return res.json(content);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch all CMS content' });
  }
});

app.post('/api/admin/content', authenticateAdmin, async (req, res) => {
  try {
    const { page, sectionKey, title, content, imageUrl, order, isActive } = req.body;
    const pageContent = await prisma.pageContent.create({
      data: { page, sectionKey, title, content, imageUrl, order: parseInt(order), isActive }
    });
    return res.status(201).json(pageContent);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create content' });
  }
});

app.put('/api/admin/content/:id', authenticateAdmin, async (req, res) => {
  try {
    const { title, content, imageUrl, order, isActive } = req.body;
    const pageContent = await prisma.pageContent.update({
      where: { id: parseInt(req.params.id) },
      data: { title, content, imageUrl, order: parseInt(order), isActive }
    });
    return res.json(pageContent);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update content' });
  }
});

app.delete('/api/admin/content/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.pageContent.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete content' });
  }
});

// --- BLOGS ---
app.get('/api/blogs', async (req, res) => {
  try {
    const blogs = await prisma.blog.findMany({
      where: { isPublished: true },
      include: { category: true, course: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(blogs);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

app.get('/api/blogs/:slug', async (req, res) => {
  try {
    const blog = await prisma.blog.findUnique({
      where: { slug: req.params.slug },
      include: { category: true, course: true }
    });
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    return res.json(blog);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

app.get('/api/admin/blogs', authenticateAdmin, async (req, res) => {
  try {
    const blogs = await prisma.blog.findMany({ include: { category: true }, orderBy: { createdAt: 'desc' } });
    return res.json(blogs);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

app.post('/api/admin/blogs', authenticateAdmin, async (req, res) => {
  try {
    const { title, content, metaTitle, metaDescription, keywords, schemaMarkup, featuredImage, isPublished, categoryId, relatedCourseId } = req.body;
    let slug = req.body.slug ? req.body.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const existing = await prisma.blog.findUnique({ where: { slug } });
    if (existing) slug += `-${Date.now()}`;

    const blog = await prisma.blog.create({
      data: { title, slug, content, metaTitle, metaDescription, keywords, schemaMarkup, featuredImage, isPublished, categoryId, relatedCourseId }
    });
    return res.status(201).json(blog);
  } catch (err) {
    console.error('Blog create error:', err);
    return res.status(500).json({ error: 'Failed to create blog' });
  }
});

app.put('/api/admin/blogs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { title, content, metaTitle, metaDescription, keywords, schemaMarkup, featuredImage, isPublished, categoryId, relatedCourseId } = req.body;
    
    let slug = req.body.slug ? req.body.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    // Ensure slug uniqueness if it changed
    const existing = await prisma.blog.findFirst({ where: { slug, NOT: { id: parseInt(req.params.id) } } });
    if (existing) slug += `-${Date.now()}`;

    const blog = await prisma.blog.update({
      where: { id: parseInt(req.params.id) },
      data: { title, slug, content, metaTitle, metaDescription, keywords, schemaMarkup, featuredImage, isPublished, categoryId, relatedCourseId }
    });
    return res.json(blog);
  } catch (err) {
    console.error('Blog update error:', err);
    return res.status(500).json({ error: 'Failed to update blog' });
  }
});

app.delete('/api/admin/blogs/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.blog.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete blog' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.blogCategory.findMany();
    return res.json(categories);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const cat = await prisma.blogCategory.create({ data: { name, slug, description } });
    return res.status(201).json(cat);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

// --- TESTIMONIALS ---
app.get('/api/testimonials', async (req, res) => {
  try {
    const t = await prisma.testimonial.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    return res.json(t);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

app.get('/api/admin/testimonials', authenticateAdmin, async (req, res) => {
  try {
    const t = await prisma.testimonial.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json(t);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch all testimonials' });
  }
});

app.post('/api/admin/testimonials', authenticateAdmin, async (req, res) => {
  try {
    const { studentName, reviewText, rating, imageUrl, isActive } = req.body;
    const t = await prisma.testimonial.create({ data: { studentName, reviewText, rating, imageUrl, isActive } });
    return res.status(201).json(t);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create testimonial' });
  }
});

app.put('/api/admin/testimonials/:id', authenticateAdmin, async (req, res) => {
  try {
    const t = await prisma.testimonial.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    return res.json(t);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update testimonial' });
  }
});

app.delete('/api/admin/testimonials/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.testimonial.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete testimonial' });
  }
});

// --- PLACEMENTS ---
app.get('/api/placements', async (req, res) => {
  try {
    const p = await prisma.placement.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    return res.json(p);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch placements' });
  }
});

app.get('/api/admin/placements', authenticateAdmin, async (req, res) => {
  try {
    const p = await prisma.placement.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json(p);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch all placements' });
  }
});

app.post('/api/admin/placements', authenticateAdmin, async (req, res) => {
  try {
    const { studentName, imageUrl, isActive } = req.body;
    const p = await prisma.placement.create({ data: { studentName, imageUrl, isActive } });
    return res.status(201).json(p);
  } catch (err) {
    console.error('Create Placement Error:', err);
    return res.status(500).json({ error: 'Failed to create placement', details: err.message });
  }
});

app.put('/api/admin/placements/:id', authenticateAdmin, async (req, res) => {
  try {
    const p = await prisma.placement.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    return res.json(p);
  } catch (err) {
    console.error('Update Placement Error:', err);
    return res.status(500).json({ error: 'Failed to update placement', details: err.message });
  }
});

app.delete('/api/admin/placements/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.placement.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete Placement Error:', err);
    return res.status(500).json({ error: 'Failed to delete placement', details: err.message });
  }
});

// --- COUPONS ---
app.post('/api/enrollment/validate-coupon', async (req, res) => {
  try {
    const { code } = req.body;
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) return res.status(400).json({ error: 'Invalid or inactive coupon' });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'Coupon usage limit reached' });
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) return res.status(400).json({ error: 'Coupon expired' });
    return res.json(coupon);
  } catch (err) {
    return res.status(500).json({ error: 'Validation failed' });
  }
});

app.post('/api/admin/coupons', authenticateAdmin, async (req, res) => {
  try {
    const { code, discountPercent, maxUses, expiryDate, isActive } = req.body;
    const c = await prisma.coupon.create({ data: { code, discountPercent: parseFloat(discountPercent), maxUses, expiryDate: expiryDate ? new Date(expiryDate) : null, isActive } });
    return res.status(201).json(c);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// --- SITEMAP ---
app.get('/api/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || 'https://clinidea.com';
    const urls = [
      { loc: `${baseUrl}/` },
      { loc: `${baseUrl}/about` },
      { loc: `${baseUrl}/contact` },
      { loc: `${baseUrl}/events` },
      { loc: `${baseUrl}/program` },
      { loc: `${baseUrl}/blog` }
    ];

    const courses = await prisma.course.findMany();
    courses.forEach(c => urls.push({ loc: `${baseUrl}/${c.slug}-course` }));

    const events = await prisma.event.findMany();
    events.forEach(e => urls.push({ loc: `${baseUrl}/events/${e.slug}` }));

    const blogs = await prisma.blog.findMany({ where: { isPublished: true } });
    blogs.forEach(b => urls.push({ loc: `${baseUrl}/blog/${b.slug}` }));

    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    urls.forEach(u => {
      sitemap += `  <url>\n    <loc>${u.loc}</loc>\n  </url>\n`;
    });
    sitemap += '</urlset>';

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});


// Schedule Event Reminder Emails (runs at the top of every hour)
cron.schedule('0 * * * *', async () => {
  try {
    const now = new Date();
    // 24 hours from now
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find all events happening between now and next 24 hours
    const upcomingEvents = await prisma.event.findMany({
      where: {
        eventDate: {
          gt: now,
          lte: next24Hours
        }
      },
      include: {
        registrations: {
          where: { reminderSent: false }
        }
      }
    });

    for (const event of upcomingEvents) {
      for (const reg of event.registrations) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: reg.email,
          subject: `Reminder: Upcoming Event - ${event.title}`,
          html: `
            <h3>Hi ${reg.name},</h3>
            <p>This is a quick reminder that <strong>${event.title}</strong> is happening soon!</p>
            <h4>Event Details:</h4>
            <ul>
              <li><strong>Date:</strong> ${new Date(event.eventDate).toLocaleDateString()}</li>
              <li><strong>Time:</strong> ${event.eventTime}</li>
              ${event.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${event.meetingLink}">${event.meetingLink}</a></li>` : ''}
            </ul>
            <p>We're looking forward to seeing you.</p>
            <p>Best regards,<br>Clinidea Education Team</p>
          `
        };

        try {
          await transporter.sendMail(mailOptions);
          await prisma.eventRegistration.update({
            where: { id: reg.id },
            data: { reminderSent: true }
          });
        } catch (emailErr) {
          console.error(`Failed to send reminder to ${reg.email} for event ${event.id}`, emailErr);
        }
      }
    }
  } catch (err) {
    console.error("Cron job error (Event Reminders):", err);
  }
});

app.get('/api/student/payments', authenticateUser, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.userId },
      orderBy: { paymentDate: 'desc' }
    });
    return res.json({ payments });
  } catch (err) {
    console.error("Student payments fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch payment records." });
  }
});

// -------- INSTALLMENT REMINDER CRON JOB --------
// Runs every day at 09:00 AM server time
cron.schedule('0 9 * * *', async () => {
  console.log("CRON: Scanning for upcoming installment payments...");
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminderThreshold = new Date(today);
    reminderThreshold.setDate(reminderThreshold.getDate() + 7); // 7 days before due date

    const pendingInstallments = await prisma.enrollment.findMany({
      where: {
        installmentCount: { gt: 1 },
        feesPending: { gt: 0 },
        reminderSent: false,
        nextInstallmentDate: { lte: reminderThreshold, gte: today }
      },
      include: { user: true }
    });

    for (const enrollment of pendingInstallments) {
      if (!enrollment.user || !enrollment.user.email) continue;
      
      const mailOptions = {
        from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
        to: enrollment.user.email,
        subject: "Upcoming Installment Payment Reminder - Clinidea",
        html: `<h3>Hello ${enrollment.user.fullName},</h3>
               <p>This is a gentle reminder that your next installment payment of <strong>₹${enrollment.feesPending}</strong> for the course <strong>${enrollment.courseName}</strong> is due on <strong>${new Date(enrollment.nextInstallmentDate).toLocaleDateString()}</strong>.</p>
               <p>Please log in to your student dashboard to complete the payment to avoid any late fees or interruption of access.</p>
               <br/>
               <p>Best regards,<br/>The Clinidea Education Team</p>`
      };

      try {
        await transporter.sendMail(mailOptions);
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { reminderSent: true }
        });
      } catch (err) {
        console.error("Installment reminder email failed:", err);
      }
    }
  } catch (err) {
    console.error("CRON Error (Installments):", err);
  }
});

// -------- EVENT AUTOMATION CRON JOB --------
// Runs every 15 minutes to check for upcoming events
cron.schedule('*/15 * * * *', async () => {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Find all upcoming events
    const upcomingEvents = await prisma.event.findMany({
      where: {
        eventDate: { gte: new Date(now.setHours(0, 0, 0, 0)) }
      },
      include: { registrations: true }
    });

    for (const event of upcomingEvents) {
      const eventDateTime = new Date(event.eventDate);
      let eHour = 0, eMin = 0;
      if (event.eventTime && event.eventTime.includes(':')) {
        [eHour, eMin] = event.eventTime.split(':').map(Number);
      }
      eventDateTime.setHours(eHour, eMin, 0, 0);

      const timeDiffMs = eventDateTime.getTime() - Date.now();
      const hoursUntilEvent = timeDiffMs / (1000 * 60 * 60);

      for (const reg of event.registrations) {
        // 1-Day Before
        if (!reg.reminder1DaySent && hoursUntilEvent <= 48 && hoursUntilEvent > 20) {
          await sendEventReminder(reg, event, "1-Day Reminder: Your event is tomorrow!");
          await prisma.eventRegistration.update({ where: { id: reg.id }, data: { reminder1DaySent: true } });
        }
        
        // Event Day
        const isEventDay = new Date(event.eventDate).toDateString() === new Date().toDateString();
        if (isEventDay && !reg.reminderMorningSent && currentHour >= 8) {
          await sendEventReminder(reg, event, "Morning Reminder: Your event is today!");
          await prisma.eventRegistration.update({ where: { id: reg.id }, data: { reminderMorningSent: true } });
        }

        if (isEventDay && !reg.reminderMiddaySent && currentHour >= 12) {
          await sendEventReminder(reg, event, "Mid-day Reminder: Your event is coming up soon!");
          await prisma.eventRegistration.update({ where: { id: reg.id }, data: { reminderMiddaySent: true } });
        }

        if (!reg.reminder1HourSent && hoursUntilEvent <= 1.25 && hoursUntilEvent > 0) {
          await sendEventReminder(reg, event, "Final Reminder: Your event starts in 1 hour!");
          await prisma.eventRegistration.update({ where: { id: reg.id }, data: { reminder1HourSent: true } });
        }
      }
    }
  } catch (err) {
    console.error("Event Automation Cron Job Error:", err);
  }
});

async function sendEventReminder(registration, event, customSubject) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: registration.email,
    subject: customSubject,
    html: `
      <h3>Hi ${registration.name},</h3>
      <p>${customSubject}</p>
      <h4>Event Details:</h4>
      <ul>
        <li><strong>Title:</strong> ${event.title}</li>
        <li><strong>Date:</strong> ${new Date(event.eventDate).toLocaleDateString()}</li>
        <li><strong>Time:</strong> ${event.eventTime}</li>
        ${event.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${event.meetingLink}">${event.meetingLink}</a></li>` : ''}
      </ul>
      <p>Best regards,<br>Clinidea Education Team</p>
    `
  };
  transporter.sendMail(mailOptions).catch(err => console.error('Reminder Email failed:', err));
  console.log(`[WHATSAPP MOCK] -> Sending to ${registration.phone}: "${customSubject} - ${event.title} on ${new Date(event.eventDate).toLocaleDateString()} at ${event.eventTime}. Link: ${event.meetingLink || 'None'}"`);
}


// -------- AUTO INJECTED DELETE ROUTES --------

app.delete('/api/admin/certificates/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.certificate.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete from certificate:', error);
    return res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.delete('/api/admin/payments/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.enrollment.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete from enrollment:', error);
    return res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.delete('/api/admin/enrollments/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.enrollment.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete from enrollment:', error);
    return res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.delete('/api/admin/students/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete from user:', error);
    return res.status(500).json({ error: 'Failed to delete record' });
  }
});

// -------- FINANCIAL DASHBOARD --------
app.get('/api/admin/finance', authenticateAdmin, async (req, res) => {
  try {
    // 1. Calculate Registration Income
    const registeredUsers = await prisma.user.count({ where: { registrationFeePaid: true } });
    const registrationIncome = registeredUsers * 500;

    // 2. Calculate Enrollment Income
    const enrollments = await prisma.enrollment.findMany();
    const enrollmentIncome = enrollments.reduce((sum, e) => sum + (e.feesPaid || 0), 0);

    // 3. Calculate Additional Income
    const additionalIncomes = await prisma.additionalIncome.findMany({ orderBy: { createdAt: 'desc' } });
    const additionalIncomeTotal = additionalIncomes.reduce((sum, i) => sum + i.amount, 0);

    // 4. Calculate Expenses
    const expenses = await prisma.expense.findMany({ orderBy: { createdAt: 'desc' } });
    const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

    const totalIncome = registrationIncome + enrollmentIncome + additionalIncomeTotal;
    const netProfit = totalIncome - expenseTotal;

    return res.json({
      success: true,
      summary: {
        registrationIncome,
        enrollmentIncome,
        additionalIncomeTotal,
        totalIncome,
        expenseTotal,
        netProfit
      },
      expenses,
      additionalIncomes
    });
  } catch (error) {
    console.error("Finance fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch finance dashboard data" });
  }
});

app.post('/api/admin/finance/expense', authenticateAdmin, async (req, res) => {
  try {
    const { title, category, amount, description } = req.body;
    if (!title || !category || !amount) return res.status(400).json({ error: "Missing required fields" });

    const expense = await prisma.expense.create({
      data: { title, category, amount: parseFloat(amount), description }
    });
    return res.json({ success: true, expense });
  } catch (error) {
    console.error("Add expense error:", error);
    return res.status(500).json({ error: "Failed to add expense" });
  }
});

app.post('/api/admin/finance/income', authenticateAdmin, async (req, res) => {
  try {
    const { title, amount, description } = req.body;
    if (!title || !amount) return res.status(400).json({ error: "Missing required fields" });

    const income = await prisma.additionalIncome.create({
      data: { title, amount: parseFloat(amount), description }
    });
    return res.json({ success: true, income });
  } catch (error) {
    console.error("Add income error:", error);
    return res.status(500).json({ error: "Failed to add income" });
  }
});


// Initialize HR Campaign Background Engine
require('./utils/campaignEngine');

// Initialize Lead Drip Engine for Enquiries
const startLeadDripEngine = require('./utils/leadDripEngine');
startLeadDripEngine();

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

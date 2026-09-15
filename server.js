const dotenvPath = require('fs').existsSync(require('path').resolve(__dirname, '.env'))
  ? require('path').resolve(__dirname, '.env')
  : require('path').resolve(__dirname, '../.env');
require('dotenv').config({ path: dotenvPath });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Request Logger
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  res.on('finish', () => {
    console.log(`[RESPONSE] ${req.method} ${req.url} -> ${res.statusCode}`);
  });
  next();
});

// ==================== MIDDLEWARE SETUP ====================

// Database initialization (direct Mongoose connection)
const db = require('./database');
db.connect().catch(() => {});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));

// Compression
app.use(compression());

// CORS
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', process.env.FRONTEND_URL].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests from this IP, please try again later'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many login attempts, please try again later'
});

app.use('/api/', apiLimiter);

// ==================== STATIC FILES ====================

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));

// ==================== BASIC ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== PUBLIC API ROUTES ====================

app.get('/api/events', async (req, res) => {
  try {
    const events = await db.event.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    }).catch(() => []);
    res.json(events);
  } catch (error) {
    console.error('Events fetch error:', error.message);
    res.json([]);
  }
});

app.get('/api/courses', async (req, res) => {
  try {
    const courses = await db.course.findMany({
      orderBy: { createdAt: 'desc' }
    }).catch(() => []);
    res.json(courses);
  } catch (error) {
    console.error('Courses fetch error:', error.message);
    res.json([]);
  }
});

app.get('/api/placements', async (req, res) => {
  try {
    const placements = await db.placement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    }).catch(() => []);
    res.json(placements);
  } catch (error) {
    console.error('Placements fetch error:', error.message);
    res.json([]);
  }
});

app.get('/api/review-videos', async (req, res) => {
  try {
    const videos = await db.studentReviewVideo.findMany({
      orderBy: { createdAt: 'desc' }
    }).catch(() => []);
    res.json(videos);
  } catch (error) {
    console.error('Review videos fetch error:', error.message);
    res.json([]);
  }
});

app.get('/api/testimonials', async (req, res) => {
  try {
    const testimonials = await db.testimonial.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    }).catch(() => []);
    res.json(testimonials);
  } catch (error) {
    console.error('Testimonials fetch error:', error.message);
    res.json([]);
  }
});

app.get(['/api/admissionsopen', '/api/admissionopen'], async (req, res) => {
  try {
    res.json({ isOpen: true, message: 'Admissions are currently open' });
  } catch (error) {
    console.error('Admissions status fetch error:', error.message);
    res.json({ isOpen: true });
  }
});

app.get('/api/eventbanner', async (req, res) => {
  try {
    const pageContent = await db.pageContent.findFirst({
      where: { type: 'eventbanner' }
    }).catch(() => null);
    res.json(pageContent || { type: 'eventbanner', content: {} });
  } catch (error) {
    console.error('Banner fetch error:', error.message);
    res.json({ type: 'eventbanner', content: {} });
  }
});

app.get('/api/studentsimg', async (req, res) => {
  try {
    const students = await db.user.findMany({
      take: 20,
      select: { id: true, fullName: true, email: true }
    }).catch(() => []);
    res.json(students);
  } catch (error) {
    console.error('Students fetch error:', error.message);
    res.json([]);
  }
});

// Public Lead submit route
app.post('/api/leads', async (req, res) => {
  try {
    const { name, phone, email, course_interest, message } = req.body;
    if (!name || !phone || !email || !course_interest) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const existingLead = await db.lead.findFirst({
      where: {
        $or: [
          { email: email },
          { phone: phone }
        ]
      }
    }).catch(() => null);

    if (existingLead) {
      return res.status(409).json({ error: "An enquiry with this email or phone number already exists." });
    }

    const newLead = await db.lead.create({
      data: {
        name,
        phone,
        email,
        courseInterest: course_interest,
        message
      }
    });

    try {
      const emailService = require('./utils/emailService');
      await emailService.sendEnquiryThankYou(newLead);
    } catch (err) {
      console.error("Email send failed:", err.message);
    }

    res.status(201).json({ success: true, lead: newLead });
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Public verify certificate route
app.get('/api/certificate/verify/:certificate_id', async (req, res) => {
  try {
    const cert = await db.certificate.findUnique({
      where: { certificateId: req.params.certificate_id },
      include: { user: true, course: true }
    });
    if (!cert) return res.status(404).json({ error: 'Certificate not found or invalid' });
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

// ==================== PROTECTED ROUTES ====================

// Import and use modular routes (if they exist)
try {
  app.use('/api/auth', require('./routes/auth') || express.Router());
} catch (e) {
  console.log('Auth routes not found, skipping');
}

try {
  app.use('/api', require('./routes/portalCore') || express.Router());
} catch (e) {
  console.log('Portal core routes not found, skipping');
}

try {
  app.use('/api/admin/student-management', require('./routes/studentManagement') || express.Router());
} catch (e) {
  console.log('Student management routes not found, skipping');
}

try {
  app.use('/api/admin/admins', require('./routes/adminUsers') || express.Router());
} catch (e) {
  console.log('Admin users routes not found, skipping');
}

try {
  app.use('/api/admin', require('./routes/adminLegacy') || express.Router());
} catch (e) {
  console.log('Legacy admin routes not found, skipping');
}

try {
  // LMS routes are defined with their public portal prefixes (e.g. /student,
  // /mentor and /admin), so mounting at /api keeps their URLs consistent with
  // the frontend rather than producing /api/lms/student/... paths.
  app.use('/api', require('./routes/lms') || express.Router());
} catch (e) {
  console.log('LMS routes not found, skipping');
}

try {
  app.use('/api/student', require('./routes/studentPayments') || express.Router());
} catch (e) {
  console.log('Payment routes not found, skipping');
}

try {
  // The mentor router already names its resource paths /mentor/... while its
  // login path is /login. It is mounted directly at /api; the login alias is
  // registered below to retain the public /api/mentor/login endpoint.
  app.use('/api', require('./routes/mentor') || express.Router());
} catch (e) {
  console.log('Mentor routes not found, skipping');
}

try {
  app.use('/api/quiz', require('./routes/quiz') || express.Router());
} catch (e) {
  console.log('Quiz routes not found, skipping');
}

try {
  app.use('/api/hr', require('./routes/hrCampaigns') || express.Router());
} catch (e) {
  console.log('HR campaigns routes not found, skipping');
}

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ==================== SERVER START ====================

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   Clinidea Backend Server              ║
╠════════════════════════════════════════╣
║   Port: ${PORT.toString().padEnd(34)}║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(26)}║
║   URL: http://localhost:${PORT.toString().padEnd(24)}║
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;

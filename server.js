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
const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', process.env.FRONTEND_URL].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow any localhost/127.0.0.1 port in development (Vite auto-shifts ports when busy)
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
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

app.get('/api/blogs', async (req, res) => {
  try {
    const blogs = await db.blog.findMany({
      where: { isPublished: { in: [true, 1] } },
      orderBy: { createdAt: 'desc' }
    }).catch(() => []);
    res.json(blogs);
  } catch (error) {
    console.error('Blogs fetch error:', error.message);
    res.json([]);
  }
});

app.get('/api/blogs/:slug', async (req, res) => {
  try {
    const blog = await db.blog.findFirst({
      where: { slug: req.params.slug, isPublished: { in: [true, 1] } }
    }).catch(() => null);
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    res.json(blog);
  } catch (error) {
    console.error('Blog fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch blog' });
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

// Public student portfolio (resume-style page) — looked up by the human-readable
// Student ID, not the Mongo _id. Only exposes public-appropriate fields.
app.get('/api/public/student-portfolio/:studentId', async (req, res) => {
  try {
    const user = await db.user.findFirst({ where: { studentId: req.params.studentId } });
    if (!user) return res.status(404).json({ error: 'Portfolio not found' });
    const profile = await db.studentProfile.findFirst({ where: { userId: user.id } });
    res.json({
      studentId: user.studentId,
      fullName: user.fullName,
      course: user.registeredCourse,
      portfolio: profile?.portfolio || {}
    });
  } catch (error) {
    console.error('Public portfolio fetch error:', error.message);
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

// Student Admission Form (multi-step, saved progressively per step)
app.post('/api/admission', async (req, res) => {
  try {
    const {
      fullName, dateOfBirth, mobileNumber, email, gender, alternateNumber,
      address, city, state, country, pincode, qualification, institution,
      yearOfPassing, govtIdNumber, panNumber, course
    } = req.body;

    if (!fullName || !dateOfBirth || !mobileNumber || !email || !gender) {
      return res.status(400).json({ error: 'Please fill all required applicant details.' });
    }

    // Email must be unique across registered (paid) students.
    const existingUser = await db.user.findFirst({ where: { email } });
    if (existingUser && existingUser.registrationFeePaid) {
      return res.status(409).json({ error: 'This email is already registered. Please log in instead of registering again.' });
    }

    const admission = await db.admission.create({
      data: {
        fullName, dateOfBirth, mobileNumber, email, gender, alternateNumber,
        address, city, state, country, pincode, qualification, institution,
        yearOfPassing, govtIdNumber, panNumber, course,
        currentStep: 1,
        status: 'in_progress'
      }
    });

    res.status(201).json({ success: true, admission });
  } catch (error) {
    console.error('Admission create error:', error.message);
    res.status(500).json({ error: 'Failed to save applicant details.' });
  }
});

app.put('/api/admission/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    // Never persist the plaintext password — only a hash, used later so a student can
    // resume straight to Payment if they abandon the flow after submitting the form.
    if (data.password) {
      const bcrypt = require('bcryptjs');
      data.passwordHash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    const updated = await db.admission.update({
      where: { id: req.params.id },
      data
    });
    const { passwordHash, ...admission } = updated;
    res.json({ success: true, admission });
  } catch (error) {
    console.error('Admission update error:', error.message);
    res.status(500).json({ error: 'Failed to update admission application.' });
  }
});

// Resume an abandoned admission straight to the Payment step. Only allowed once the
// applicant has completed the Application Form step (Section E + terms + facial +
// signature), matching the email/password they set on Steps 1 & 2.
// If this applicant already completed registration and paid (a student account with a
// studentId already exists for their email), log them straight into their student
// portfolio instead of walking them into the Payment step again.
app.post('/api/admission/resume', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const normalizedEmail = String(email).trim();

    const candidates = await db.admission.findMany({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'desc' }
    });

    for (const candidate of candidates) {
      if (!candidate.passwordHash || !candidate.applicationFormPdfUrl) continue;
      const matches = await bcrypt.compare(password, candidate.passwordHash);
      if (matches) {
        const existingUser = await db.user.findFirst({ where: { email: normalizedEmail } });
        if (existingUser && existingUser.registrationFeePaid && existingUser.studentId) {
          const jwt = require('jsonwebtoken');
          const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';
          const token = jwt.sign({ id: existingUser.id, email: existingUser.email, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
          return res.json({ success: true, alreadyRegistered: true, token, studentId: existingUser.studentId });
        }

        const { passwordHash, ...safeAdmission } = candidate;
        return res.json({ success: true, admission: safeAdmission });
      }
    }

    res.status(404).json({ error: 'No submitted application found for this email and password. Make sure you completed the Application Form step before trying to resume.' });
  } catch (error) {
    console.error('Admission resume error:', error.message);
    res.status(500).json({ error: 'Failed to resume application.' });
  }
});

app.get('/api/admission/:id', async (req, res) => {
  try {
    const found = await db.admission.findUnique({ where: { id: req.params.id } });
    if (!found) return res.status(404).json({ error: 'Admission application not found' });
    const { passwordHash, ...admission } = found;
    res.json(admission);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admission application.' });
  }
});

// Save terms agreement + facial/signature verification, generate the signed Application
// Form PDF from the applicant's own saved data, and return it for download.
app.post('/api/admission/:id/generate-form', async (req, res) => {
  try {
    const { termsReadConfirmed, termsAgreed, facialPhotoUrl, signatureUrl } = req.body;
    if (!termsReadConfirmed || !termsAgreed) {
      return res.status(400).json({ error: 'Please confirm you have read and agree to the terms and conditions.' });
    }
    if (!facialPhotoUrl || !signatureUrl) {
      return res.status(400).json({ error: 'Live facial verification and digital signature are both required.' });
    }

    const admission = await db.admission.update({
      where: { id: req.params.id },
      data: { termsReadConfirmed, termsAgreed, facialPhotoUrl, signatureUrl, applicationSubmittedAt: new Date() }
    });

    const { generateApplicationFormPDF } = require('./utils/pdf_generator');
    const pdfUrl = await generateApplicationFormPDF(admission);

    await db.admission.update({ where: { id: req.params.id }, data: { applicationFormPdfUrl: pdfUrl } });

    res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Application form generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate the application form.' });
  }
});

// Admission document upload (photo / ID proof / PAN / certificates) -> Cloudinary
const multer = require('multer');
const docUpload = multer({ dest: path.join(uploadDir, 'tmp'), limits: { fileSize: 15 * 1024 * 1024 } });
app.post('/api/admission/upload-document', docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { uploadToCloudinary } = require('./utils/cloudinary');
    const result = await uploadToCloudinary(req.file.path, 'admission_documents');
    fs.unlink(req.file.path, () => {});
    res.json({ success: true, url: result.url });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    console.error('Document upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Public coupon validation (used during registration payment, before login)
app.post('/api/coupons/validate', async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Coupon code is required' });

    const coupon = await db.coupon.findFirst({ where: { code } });
    if (!coupon || coupon.isActive === false) return res.status(400).json({ error: 'Invalid or inactive coupon' });
    if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) return res.status(400).json({ error: 'Coupon usage limit reached' });
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) return res.status(400).json({ error: 'Coupon has expired' });

    res.json({ valid: true, code: coupon.code, discountPercent: coupon.discountPercent });
  } catch (error) {
    console.error('Coupon validation error:', error.message);
    res.status(500).json({ error: 'Failed to validate coupon' });
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

# Clinidea Backend - Refactored Structure

## Overview

This backend has been refactored with a clean, modular architecture following industry best practices for Express.js applications.

## Architecture

```
backend/
├── server.js                 # Main server entry point
├── .env                      # Environment variables (created)
├── package.json              # Dependencies
├── routes/                   # API route modules
│   ├── auth.js              # Authentication endpoints (LOGIN/REGISTER)
│   ├── courses.js           # Course management
│   ├── studentManagement.js # Student CRUD operations
│   ├── adminUsers.js        # Admin management
│   ├── lms.js               # Learning management system
│   ├── studentPayments.js   # Payment processing
│   ├── mentor.js            # Mentor functionality
│   ├── quiz.js              # Quiz management
│   └── hrCampaigns.js       # HR campaign management
├── middleware/              # Custom middleware
│   └── auth.js              # JWT authentication middleware
├── utils/                   # Utility functions
├── prisma/                  # Database schema & migrations
│   ├── schema.prisma        # Data model
│   └── dev.db               # SQLite database
└── uploads/                 # File upload storage
```

## Key Features

### 1. Clean Architecture
- **Modular Routes**: Each feature has its own route file
- **Middleware Layer**: Centralized authentication and authorization
- **Error Handling**: Global error handler with graceful error responses
- **Security**: Helmet.js, CORS, Rate limiting, JWT tokens

### 2. Public API Endpoints (No Authentication Required)
```
GET  /api/events           # List all events
GET  /api/courses          # List all courses
GET  /api/placements       # List all placements
GET  /api/review-videos    # List review videos
GET  /api/testimonials     # List approved testimonials
GET  /api/admissionsopen   # Check admission status
GET  /api/eventbanner      # Get event banner
GET  /api/studentsimg      # Get student images
```

### 3. Authentication Endpoints
```
POST /api/auth/login       # Login (email + password)
POST /api/auth/register    # Register new student
GET  /api/auth/me          # Get current user info
```

### 4. Protected Routes (Require JWT Token)
```
/api/students/*            # Student management
/api/admin/*               # Admin operations
/api/courses/*             # Course operations
/api/lms/*                 # LMS operations
/api/payments/*            # Payment processing
/api/mentor/*              # Mentor operations
/api/quiz/*                # Quiz management
/api/hr/*                  # HR campaigns
```

## Environment Configuration

### Required Variables
```
PORT=5000
DATABASE_URL="file:./backend/prisma/dev.db"
JWT_SECRET="your-secret-key"
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"
```

### Optional Variables
- Email configuration (Nodemailer)
- Payment gateway (Razorpay)
- Cloud storage (AWS S3, Cloudflare R2)
- WhatsApp integration (Twilio)
- Google Drive integration

## Running the Server

```bash
# Install dependencies
npm install --ignore-scripts

# Generate Prisma Client
npx prisma generate

# Start the server
node server.js
```

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* response data */ }
}
```

### Error Response
```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

## Database

### Database URL Configuration
- **Development**: SQLite (`file:./backend/prisma/dev.db`)
- **Production**: PostgreSQL (set `DATABASE_URL` environment variable)

### Prisma Commands
```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Reset database
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

## Middleware Stack

1. **Helmet**: Security headers
2. **Compression**: Response compression
3. **CORS**: Cross-origin resource sharing
4. **Rate Limiting**: API request throttling
5. **Body Parser**: JSON/URL-encoded parsing
6. **Static Files**: Serve uploads folder

## Error Handling

- **404 Errors**: Route not found responses
- **Global Error Handler**: Catches all unhandled errors
- **Validation**: Input validation on protected routes
- **Database Errors**: Graceful error messages

## Development Workflow

### Adding New Routes
1. Create a file in `routes/` directory
2. Define route handlers with proper error handling
3. Import and use the router in `server.js`
4. Example:
```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  // Handle request
});

module.exports = router;
```

### Adding Middleware
1. Create middleware file in `middleware/` directory
2. Export middleware functions
3. Use with `app.use()` or route-specific placement

## CORS Configuration

By default, CORS allows:
- Origins: `localhost:5173`, `localhost:3000`, and `FRONTEND_URL` env var
- Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
- Headers: Content-Type, Authorization, X-Requested-With

## Rate Limiting

- **General API**: 500 requests per 15 minutes per IP
- **Auth Endpoints**: 50 attempts per 15 minutes per IP

## Troubleshooting

### Server won't start
- Check if port 5000 is in use: `netstat -ano | findstr :5000`
- Verify `.env` file exists and has `DATABASE_URL`
- Run: `npx prisma generate`

### Database errors
- Check SQLite database exists: `backend/prisma/dev.db`
- Run Prisma migrations: `npx prisma migrate dev`
- Check `DATABASE_URL` in `.env`

### CORS errors
- Verify frontend is running on `localhost:5173`
- Update `FRONTEND_URL` in `.env` if using different port

## Next Steps

1. Implement user authentication properly with admin seeding
2. Create database migrations for all models
3. Implement protected routes with proper authorization
4. Add input validation with Zod/Joi
5. Add comprehensive logging
6. Set up error tracking (Sentry, etc.)
7. Write unit and integration tests
8. Add API documentation (Swagger/OpenAPI)

## Backup

The original `server.js` has been backed up as `server.backup.js` in case you need to reference it.

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = require('../database');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';

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

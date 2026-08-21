const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { authenticateAdmin } = require('../middleware/auth');

router.use(authenticateAdmin);

// Middleware to ensure only superadmin can access these routes
const ensureSuperAdmin = (req, res, next) => {
  if (req.adminRole !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden: Only Super Admin can manage roles.' });
  }
  next();
};

// GET all admin users (excluding passwords)
router.get('/', ensureSuperAdmin, async (req, res) => {
  try {
    const admins = await db.admin.findMany({
      select: {
        id: true,
        email: true,
        role: true,
      },
      orderBy: { id: 'desc' }
    });
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

// POST to create a new admin user
router.post('/', ensureSuperAdmin, async (req, res) => {
  const { email, password, role, name, fullName } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Email, password, and role are required' });
  }
  
  try {
    const existingAdmin = await db.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await db.admin.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        role: role,
        name: name || fullName || email.split('@')[0],
        fullName: name || fullName || email.split('@')[0]
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        fullName: true
      }
    });

    res.status(201).json(newAdmin);
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// DELETE an admin user
router.delete('/:id', ensureSuperAdmin, async (req, res) => {
  const { id } = req.params;
  
  // Prevent deleting the currently logged-in superadmin
  if (String(id) === req.adminId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    await db.admin.delete({
      where: { id: String(id) }
    });
    res.json({ message: 'Admin user deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Failed to delete admin user' });
  }
});

// PUT to update an admin user
router.put('/:id', ensureSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, password, role } = req.body;
  
  try {
    const updateData = { role };
    if (email) updateData.email = email.toLowerCase();
    
    // Check if new email is already taken by another admin
    if (email) {
      const existing = await db.admin.findUnique({ where: { email: email.toLowerCase() } });
      if (existing && existing.id !== String(id)) {
        return res.status(400).json({ error: 'Email already in use by another account' });
      }
    }

    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedAdmin = await db.admin.update({
      where: { id: String(id) },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    res.json(updatedAdmin);
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({ error: 'Failed to update admin user' });
  }
});

module.exports = router;

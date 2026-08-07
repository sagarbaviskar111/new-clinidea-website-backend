const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

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
    const admins = await prisma.admin.findMany({
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
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Email, password, and role are required' });
  }
  
  try {
    const existingAdmin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await prisma.admin.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        role: role
      },
      select: {
        id: true,
        email: true,
        role: true
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
  if (parseInt(id) === req.adminId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    await prisma.admin.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: 'Admin user deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Failed to delete admin user' });
  }
});

module.exports = router;

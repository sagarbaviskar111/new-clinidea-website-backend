const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/campaign_cvs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Setup multer for CV uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'CV-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// --------------------------------------------------------
// EMAIL ACCOUNTS
// --------------------------------------------------------

router.get('/email-accounts', async (req, res) => {
  try {
    const accounts = await prisma.emailAccount.findMany({
      orderBy: { createdAt: 'desc' }
    });
    // Strip passwords before sending to frontend
    const safeAccounts = accounts.map(acc => {
      const { password, ...rest } = acc;
      return rest;
    });
    res.json(safeAccounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch email accounts' });
  }
});

router.post('/email-accounts', async (req, res) => {
  try {
    const { email, password, smtpHost, smtpPort, dailyLimit } = req.body;
    const account = await prisma.emailAccount.create({
      data: {
        email,
        password,
        smtpHost: smtpHost || 'smtp.office365.com',
        smtpPort: parseInt(smtpPort) || 587,
        dailyLimit: parseInt(dailyLimit) || 500
      }
    });
    const { password: pwd, ...safeAcc } = account;
    res.status(201).json(safeAcc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create email account' });
  }
});

router.put('/email-accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, password, dailyLimit } = req.body;
    
    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = password;
    if (dailyLimit !== undefined) updateData.dailyLimit = parseInt(dailyLimit);

    const account = await prisma.emailAccount.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    const { password: pwd, ...safeAcc } = account;
    res.json(safeAcc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update email account' });
  }
});

router.delete('/email-accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.emailAccount.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete email account' });
  }
});

// --------------------------------------------------------
// HR CONTACTS
// --------------------------------------------------------

router.get('/hr-contacts', async (req, res) => {
  try {
    const contacts = await prisma.hRContact.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch HR contacts' });
  }
});

router.post('/hr-contacts', async (req, res) => {
  try {
    const { email, name, company, tags, notes } = req.body;
    
    // Upsert to handle existing emails
    const contact = await prisma.hRContact.upsert({
      where: { email },
      update: { name, company, tags, notes },
      create: { email, name, company, tags, notes }
    });
    res.status(201).json(contact);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create HR contact' });
  }
});

router.delete('/hr-contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.hRContact.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete HR contact' });
  }
});

// --------------------------------------------------------
// HR CAMPAIGNS
// --------------------------------------------------------

router.get('/hr-campaigns', async (req, res) => {
  try {
    const campaigns = await prisma.hRCampaign.findMany({
      include: {
        emailAccount: { select: { email: true } },
        _count: { select: { recipients: true, attachments: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

router.get('/hr-campaigns/:id', async (req, res) => {
  try {
    const campaign = await prisma.hRCampaign.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        emailAccount: { select: { email: true } },
        recipients: {
          include: { hrContact: true }
        },
        attachments: true
      }
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

router.post('/hr-campaigns', async (req, res) => {
  try {
    const { name, subject, body, emailAccountId, rateLimitLimit } = req.body;
    const campaign = await prisma.hRCampaign.create({
      data: {
        name,
        subject,
        body,
        emailAccountId: emailAccountId ? parseInt(emailAccountId) : null,
        rateLimitLimit: rateLimitLimit ? parseInt(rateLimitLimit) : 50
      }
    });
    res.status(201).json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.put('/hr-campaigns/:id', async (req, res) => {
  try {
    const { name, subject, body, emailAccountId, rateLimitLimit } = req.body;
    const campaign = await prisma.hRCampaign.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        subject,
        body,
        emailAccountId: emailAccountId ? parseInt(emailAccountId) : null,
        rateLimitLimit: rateLimitLimit ? parseInt(rateLimitLimit) : 50
      }
    });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

router.delete('/hr-campaigns/:id', async (req, res) => {
  try {
    await prisma.hRCampaign.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

router.post('/hr-campaigns/:id/start', async (req, res) => {
  try {
    const campaign = await prisma.hRCampaign.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'running' }
    });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

router.post('/hr-campaigns/:id/pause', async (req, res) => {
  try {
    const campaign = await prisma.hRCampaign.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'paused' }
    });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

// --------------------------------------------------------
// CAMPAIGN CV UPLOADS & RECIPIENTS
// --------------------------------------------------------

router.post('/hr-campaigns/:id/upload-cvs', upload.array('cvs', 100), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const attachments = [];
    for (const file of files) {
      // Use original filename (without extension) as mapping ID by default, or just the filename
      const mappingId = path.parse(file.originalname).name;
      
      const attachment = await prisma.hRCVAttachment.create({
        data: {
          campaignId,
          mappingId: mappingId,
          fileName: file.originalname,
          fileUrl: `/uploads/campaign_cvs/${file.filename}`
        }
      });
      attachments.push(attachment);
    }

    res.json({ success: true, count: attachments.length, attachments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload CVs' });
  }
});

router.post('/hr-campaigns/:id/recipients', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const { recipients } = req.body; // Array of { email, name, company, tags, cvMappingId }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Invalid recipients data' });
    }

    let addedCount = 0;
    for (const rec of recipients) {
      if (!rec.email) continue;

      // Ensure HR contact exists
      const contact = await prisma.hRContact.upsert({
        where: { email: rec.email },
        update: { 
          name: rec.name || undefined,
          company: rec.company || undefined,
          tags: rec.tags || undefined
        },
        create: {
          email: rec.email,
          name: rec.name,
          company: rec.company,
          tags: rec.tags
        }
      });

      // Add to campaign
      await prisma.hRCampaignRecipient.upsert({
        where: {
          campaignId_hrContactId: {
            campaignId: campaignId,
            hrContactId: contact.id
          }
        },
        update: { cvMappingId: rec.cvMappingId },
        create: {
          campaignId: campaignId,
          hrContactId: contact.id,
          cvMappingId: rec.cvMappingId,
          status: 'pending'
        }
      });
      addedCount++;
    }

    // Update total count
    const totalRecipients = await prisma.hRCampaignRecipient.count({ where: { campaignId } });
    await prisma.hRCampaign.update({
      where: { id: campaignId },
      data: { totalRecipients }
    });

    res.json({ success: true, addedCount, totalRecipients });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import recipients' });
  }
});

module.exports = router;

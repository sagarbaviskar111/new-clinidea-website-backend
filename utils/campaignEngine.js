const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const path = require('path');

const prisma = new PrismaClient();

// Helper to replace placeholders like {{Name}}, {{Company}}
const parseEmailBody = (body, contact) => {
  let parsed = body;
  parsed = parsed.replace(/{{Name}}/gi, contact.name || 'HR Professional');
  parsed = parsed.replace(/{{Company}}/gi, contact.company || 'your esteemed organization');
  return parsed;
};

// Start the cron job every minute
cron.schedule('* * * * *', async () => {
  // console.log("Running HR Campaign Engine...");
  
  try {
    // 1. Find all running campaigns
    const runningCampaigns = await prisma.hRCampaign.findMany({
      where: { status: 'running' },
      include: {
        emailAccount: true, // the explicitly assigned account, if any
      }
    });

    if (runningCampaigns.length === 0) return;

    for (const campaign of runningCampaigns) {
      // 2. Fetch pending recipients up to the rate limit
      const pendingRecipients = await prisma.hRCampaignRecipient.findMany({
        where: {
          campaignId: campaign.id,
          status: 'pending'
        },
        take: campaign.rateLimitLimit,
        include: {
          hrContact: true
        }
      });

      if (pendingRecipients.length === 0) {
        // If no more pending recipients, mark campaign as completed
        await prisma.hRCampaign.update({
          where: { id: campaign.id },
          data: { status: 'completed' }
        });
        continue;
      }

      // 3. Select email account
      let accountToUse = campaign.emailAccount;

      // If no explicit account, implement auto-rotation
      if (!accountToUse) {
        // For simplicity: Find first active account that hasn't hit its daily limit
        accountToUse = await prisma.emailAccount.findFirst({
          where: {
            isActive: true,
            sentToday: { lt: prisma.emailAccount.fields.dailyLimit }
          },
          orderBy: { lastUsedAt: 'asc' } // basic round-robin
        });
      }

      if (!accountToUse) {
        console.warn(`Campaign ${campaign.id}: No active email accounts available with remaining daily limits. Pausing campaign.`);
        await prisma.hRCampaign.update({
          where: { id: campaign.id },
          data: { status: 'paused' }
        });
        continue;
      }

      // 4. Create Transporter
      const transporter = nodemailer.createTransport({
        host: accountToUse.smtpHost,
        port: accountToUse.smtpPort,
        secure: accountToUse.smtpPort === 465,
        auth: {
          user: accountToUse.email,
          pass: accountToUse.password
        }
      });

      let sentInThisBatch = 0;
      let failedInThisBatch = 0;

      // 5. Send Emails
      for (const recipient of pendingRecipients) {
        // Stop if account hit its limit mid-batch
        if (accountToUse.sentToday + sentInThisBatch >= accountToUse.dailyLimit) {
          break;
        }

        const emailBody = parseEmailBody(campaign.body, recipient.hrContact);
        
        const mailOptions = {
          from: `"Placement Team" <${accountToUse.email}>`,
          to: recipient.hrContact.email,
          subject: campaign.subject,
          html: emailBody,
          attachments: []
        };

        // Fetch all attachments for this campaign ONCE (if not already fetched, but let's just do it directly or fetch it before loop)
        const campaignAttachments = await prisma.hRCVAttachment.findMany({
          where: { campaignId: campaign.id }
        });

        // Attach ALL uploaded CVs to this email
        for (const attachmentRecord of campaignAttachments) {
          mailOptions.attachments.push({
            filename: attachmentRecord.fileName,
            path: path.join(__dirname, '..', attachmentRecord.fileUrl)
          });
        }

        try {
          await transporter.sendMail(mailOptions);
          
          await prisma.hRCampaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'sent',
              sentAt: new Date()
            }
          });

          sentInThisBatch++;
        } catch (err) {
          console.error(`Failed to send email to ${recipient.hrContact.email}:`, err);
          await prisma.hRCampaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'failed',
              error: err.message
            }
          });
          failedInThisBatch++;
        }
      }

      // 6. Update counts
      if (sentInThisBatch > 0 || failedInThisBatch > 0) {
        await prisma.hRCampaign.update({
          where: { id: campaign.id },
          data: {
            sentCount: { increment: sentInThisBatch },
            failedCount: { increment: failedInThisBatch }
          }
        });

        await prisma.emailAccount.update({
          where: { id: accountToUse.id },
          data: {
            sentToday: { increment: sentInThisBatch },
            lastUsedAt: new Date()
          }
        });
      }

    }

  } catch (error) {
    console.error("Error in HR Campaign Engine:", error);
  }
});

console.log("HR Campaign Background Engine Initialized");

// Setup midnight cron to reset `sentToday` limits for email accounts
cron.schedule('0 0 * * *', async () => {
  try {
    await prisma.emailAccount.updateMany({
      data: { sentToday: 0 }
    });
    console.log("Reset daily limits for all email accounts");
  } catch (err) {
    console.error("Failed to reset daily limits:", err);
  }
});

const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const emailService = require('./emailService');

const prisma = new PrismaClient();

// Configuration for Drip Campaign Intervals (in days)
const DRIP_INTERVALS = [
  { reminderNumber: 1, daysAfterCreation: 1 },
  { reminderNumber: 2, daysAfterCreation: 3 },
  { reminderNumber: 3, daysAfterCreation: 7 },
  { reminderNumber: 4, daysAfterCreation: 14 }
];

const startLeadDripEngine = () => {
  // Run every day at 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    console.log("[LeadDripEngine] Running daily check for enquiry reminders...");
    try {
      const activeLeads = await prisma.lead.findMany({
        where: {
          status: 'New',
          reminderCount: { lt: 4 }
        }
      });

      const now = new Date();

      for (const lead of activeLeads) {
        const daysSinceCreation = Math.floor((now - new Date(lead.createdAt)) / (1000 * 60 * 60 * 24));
        
        // Find the next reminder to send based on current reminderCount
        const nextReminder = DRIP_INTERVALS.find(r => r.reminderNumber === lead.reminderCount + 1);

        if (nextReminder && daysSinceCreation >= nextReminder.daysAfterCreation) {
          console.log(`[LeadDripEngine] Sending Reminder ${nextReminder.reminderNumber} to ${lead.email}`);
          
          await emailService.sendEnquiryReminder(lead, nextReminder.reminderNumber);

          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              reminderCount: nextReminder.reminderNumber,
              lastReminderAt: now
            }
          });
        }
      }
      
    } catch (error) {
      console.error("[LeadDripEngine] Error running drip engine:", error);
    }
  });

  console.log("Lead Drip Campaign Engine Initialized (Runs daily at 10:00 AM)");
};

module.exports = startLeadDripEngine;

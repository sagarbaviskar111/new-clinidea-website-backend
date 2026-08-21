const db = require('./database');

async function resetTestData() {
  console.log("Starting test data reset...");

  try {
    // We will delete all records from these tables
    // Thanks to Prisma's CASCADE deletes, deleting Users and Batches will clean up most related records automatically.
    
    console.log("Deleting Leads...");
    await db.lead.deleteMany();

    console.log("Deleting Users (Students/Mentors)...");
    await db.user.deleteMany();

    console.log("Deleting Batches...");
    await db.batch.deleteMany();

    console.log("Deleting Events...");
    await db.event.deleteMany();

    console.log("Deleting HR Campaigns...");
    await db.hRCampaign.deleteMany();

    console.log("Deleting Testimonials...");
    await db.testimonial.deleteMany();

    console.log("Deleting Blogs...");
    await db.blog.deleteMany();

    console.log("Deleting Placements...");
    await db.placement.deleteMany();

    console.log("Deleting Email Accounts...");
    await db.emailAccount.deleteMany();

    console.log("Deleting Admin Audit Logs...");
    await db.adminAuditLog.deleteMany();

    console.log("Test data has been successfully wiped!");
    console.log("Admins and Courses have been retained.");

  } catch (error) {
    console.error("Error during reset:", error);
  } finally {
    await db.$disconnect();
  }
}

resetTestData();

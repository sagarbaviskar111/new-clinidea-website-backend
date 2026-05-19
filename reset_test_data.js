const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetTestData() {
  console.log("Starting test data reset...");

  try {
    // We will delete all records from these tables
    // Thanks to Prisma's CASCADE deletes, deleting Users and Batches will clean up most related records automatically.
    
    console.log("Deleting Leads...");
    await prisma.lead.deleteMany();

    console.log("Deleting Users (Students/Mentors)...");
    await prisma.user.deleteMany();

    console.log("Deleting Batches...");
    await prisma.batch.deleteMany();

    console.log("Deleting Events...");
    await prisma.event.deleteMany();

    console.log("Deleting HR Campaigns...");
    await prisma.hRCampaign.deleteMany();

    console.log("Deleting Testimonials...");
    await prisma.testimonial.deleteMany();

    console.log("Deleting Blogs...");
    await prisma.blog.deleteMany();

    console.log("Deleting Placements...");
    await prisma.placement.deleteMany();

    console.log("Deleting Email Accounts...");
    await prisma.emailAccount.deleteMany();

    console.log("Deleting Admin Audit Logs...");
    await prisma.adminAuditLog.deleteMany();

    console.log("Test data has been successfully wiped!");
    console.log("Admins and Courses have been retained.");

  } catch (error) {
    console.error("Error during reset:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetTestData();

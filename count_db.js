const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Events:', await prisma.event.count());
  console.log('EventReg:', await prisma.eventRegistration.count());
  console.log('Blogs:', await prisma.blog.count());
  console.log('Testimonials:', await prisma.testimonial.count());
  console.log('Placements:', await prisma.placement.count());
  console.log('Coupons:', await prisma.coupon.count());
  console.log('LMS:', await prisma.lMSContent.count());
  console.log('Sessions:', await prisma.classSession.count());
  console.log('Payments:', await prisma.payment.count());
}

main().finally(() => prisma.$disconnect());

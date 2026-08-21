const db = require('./database');

async function main() {
  console.log('Events:', await db.event.count());
  console.log('EventReg:', await db.eventRegistration.count());
  console.log('Blogs:', await db.blog.count());
  console.log('Testimonials:', await db.testimonial.count());
  console.log('Placements:', await db.placement.count());
  console.log('Coupons:', await db.coupon.count());
  console.log('LMS:', await db.lMSContent.count());
  console.log('Sessions:', await db.classSession.count());
  console.log('Payments:', await db.payment.count());
}

main().finally(() => db.$disconnect());

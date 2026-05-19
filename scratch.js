const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Create a mock webinar event
    const event = await prisma.event.create({
      data: {
        title: 'Pharmacovigilance Advanced Masterclass',
        description: 'Learn the details of adverse drug reactions, case processing, and signal detection from global industry mentors.',
        eventType: 'webinar',
        eventDate: new Date('2026-06-15T13:00:00.000Z'),
        eventTime: '06:30 PM',
        durationMinutes: 90,
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        imageUrl: '',
        youtubeUrl: ''
      }
    });
    console.log('Seeded event successfully:', event);

    // 2. Add 3 participants/registrations to the event
    const p1 = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        name: 'Aditya Sharma',
        phone: '+919876543210',
        email: 'aditya@gmail.com'
      }
    });

    const p2 = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        name: 'Pooja Patel',
        phone: '+918765432109',
        email: 'pooja@gmail.com'
      }
    });

    const p3 = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        name: 'Dr. Rajesh Kumar',
        phone: '+917654321098',
        email: 'rajesh@gmail.com'
      }
    });

    console.log('Seeded registrations successfully:', [p1, p2, p3]);
  } catch (error) {
    console.error('Error seeding events:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

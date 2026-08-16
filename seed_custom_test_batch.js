const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestBatchAndStudents() {
  console.log('--- Creating Fresh Test Batch & Students for Live Testing ---');

  const hashedPassword = await bcrypt.hash('123456', 10);

  // 1. Ensure Mentor Account
  const mentor = await prisma.admin.upsert({
    where: { email: 'mentor@clinidea.in' },
    update: { password: hashedPassword, role: 'mentor' },
    create: { email: 'mentor@clinidea.in', password: hashedPassword, role: 'mentor' }
  });

  // 2. Ensure Course Master
  const course = await prisma.course.upsert({
    where: { slug: 'clinical-research-cr-pv-dm-course' },
    update: { name: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)' },
    create: {
      slug: 'clinical-research-cr-pv-dm-course',
      name: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)',
      description: 'Comprehensive Postgraduate Clinical Research and PV Training Program',
      duration: '6 Months',
      fees: 45000
    }
  });

  // 3. Create Dedicated Test Batch 2026-B
  const testBatch = await prisma.batch.upsert({
    where: { id: 2 },
    update: { batchName: 'Clinical Research & PV Batch 2026-B', courseId: course.id },
    create: {
      id: 2,
      batchName: 'Clinical Research & PV Batch 2026-B',
      courseId: course.id,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-02-01'),
      classTime: '02:00 PM - 03:30 PM'
    }
  });

  // 4. Assign Mentor to Batch 2026-B
  await prisma.batchMentor.upsert({
    where: { batchId_mentorId_moduleName: { batchId: testBatch.id, mentorId: mentor.id, moduleName: 'Pharmacovigilance & GCP' } },
    update: {},
    create: {
      batchId: testBatch.id,
      mentorId: mentor.id,
      moduleName: 'Pharmacovigilance & GCP'
    }
  });

  // 5. Create Fresh Test Students for this Batch
  const testStudents = [
    {
      fullName: 'Dr. Rohit Verma',
      email: 'rohit.student@clinidea.in',
      phone: '9988771101',
      courseName: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)'
    },
    {
      fullName: 'Ananya Roy',
      email: 'ananya.student@clinidea.in',
      phone: '9988771102',
      courseName: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)'
    },
    {
      fullName: 'Vikramaditya Singh',
      email: 'vikram.student@clinidea.in',
      phone: '9988771103',
      courseName: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)'
    }
  ];

  for (let i = 0; i < testStudents.length; i++) {
    const s = testStudents[i];
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { password: hashedPassword, registeredCourse: s.courseName },
      create: {
        fullName: s.fullName,
        email: s.email,
        phone: s.phone,
        password: hashedPassword,
        role: 'student',
        registeredCourse: s.courseName,
        registrationFeePaid: true,
        isRegistrationConfirmed: true
      }
    });

    await prisma.enrollment.upsert({
      where: { id: 10 + i },
      update: { userId: user.id, batchId: testBatch.id },
      create: {
        id: 10 + i,
        userId: user.id,
        courseName: s.courseName,
        batchId: testBatch.id,
        paymentType: 'installment',
        amount: 45000,
        totalFees: 45000,
        feesPaid: i === 0 ? 45000 : 25000,
        feesPending: i === 0 ? 0 : 20000,
        paymentStatus: i === 0 ? 'completed' : 'pending',
        enrollmentStatus: 'approved'
      }
    });
  }

  // 6. Create Live Session for this batch
  await prisma.classSession.create({
    data: {
      batchId: testBatch.id,
      mentorId: mentor.id,
      title: 'Live Interactive Session: Pharmacovigilance Safety Reporting',
      sessionDate: new Date('2026-08-16T14:00:00Z'),
      sessionTime: '02:00 PM',
      meetingLink: 'https://zoom.us/j/98765432109?pwd=clinidea-pv-test',
      status: 'upcoming'
    }
  });

  // 7. Create Study Material
  await prisma.lMSContent.create({
    data: {
      batchId: testBatch.id,
      title: 'Module 1: Signal Detection & ICSR Case Processing Guide',
      description: 'Official Clinical Trial Reference Documentation',
      contentType: 'pdf',
      category: 'Study Material',
      localFileUrl: '/uploads/ICSR_Processing_Guide.pdf'
    }
  });

  // 8. Create MCQ Exam for this batch
  const exam = await prisma.batchExam.create({
    data: {
      batchId: testBatch.id,
      mentorId: mentor.id,
      title: 'Pharmacovigilance & GCP Assessment Test',
      totalMarks: 20,
      startTime: new Date('2026-08-10T10:00:00Z'),
      endTime: new Date('2026-08-25T18:00:00Z')
    }
  });

  await prisma.examQuestion.create({
    data: {
      examId: exam.id,
      questionText: 'Which of the following is mandatory when submitting an expedited ICSR report?',
      optionsJson: JSON.stringify(['Identifiable Patient', 'Identifiable Reporter', 'Suspect Adverse Event', 'All of the above']),
      correctOption: 'All of the above',
      marks: 20,
      type: 'mcq'
    }
  });

  console.log('--- ✅ Test Batch "Clinical Research & PV Batch 2026-B" Created Successfully! ---');
}

createTestBatchAndStudents()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

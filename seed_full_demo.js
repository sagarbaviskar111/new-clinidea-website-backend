const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedFullDemo() {
  console.log('--- Starting Full Demo Data Seeding for All 4 Roles ---');

  const hashedPassword = await bcrypt.hash('123456', 10);

  // 1. Seed Admins & Roles
  console.log('1. Seeding Admin, Mentor & Coordinator Accounts...');
  const superadmin = await prisma.admin.upsert({
    where: { email: 'admin@clinidea.in' },
    update: { password: hashedPassword, role: 'superadmin' },
    create: { email: 'admin@clinidea.in', password: hashedPassword, role: 'superadmin' }
  });

  await prisma.admin.upsert({
    where: { email: 'admin@example.com' },
    update: { password: hashedPassword, role: 'superadmin' },
    create: { email: 'admin@example.com', password: hashedPassword, role: 'superadmin' }
  });

  const mentor = await prisma.admin.upsert({
    where: { email: 'mentor@clinidea.in' },
    update: { password: hashedPassword, role: 'mentor' },
    create: { email: 'mentor@clinidea.in', password: hashedPassword, role: 'mentor' }
  });

  await prisma.admin.upsert({
    where: { email: 'mentor@example.com' },
    update: { password: hashedPassword, role: 'mentor' },
    create: { email: 'mentor@example.com', password: hashedPassword, role: 'mentor' }
  });

  const coordinator = await prisma.admin.upsert({
    where: { email: 'coordinator@clinidea.in' },
    update: { password: hashedPassword, role: 'coordinator' },
    create: { email: 'coordinator@clinidea.in', password: hashedPassword, role: 'coordinator' }
  });

  await prisma.admin.upsert({
    where: { email: 'coordinator@example.com' },
    update: { password: hashedPassword, role: 'coordinator' },
    create: { email: 'coordinator@example.com', password: hashedPassword, role: 'coordinator' }
  });

  // 2. Seed Course & Batch
  console.log('2. Seeding Course & Batch...');
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

  const batch = await prisma.batch.upsert({
    where: { id: 1 },
    update: { batchName: 'Clinical Research 2026-A', courseId: course.id },
    create: {
      batchName: 'Clinical Research 2026-A',
      courseId: course.id,
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-07-15'),
      classTime: '10:00 AM - 11:30 AM'
    }
  });

  // Map Mentor to Batch
  await prisma.batchMentor.upsert({
    where: { batchId_mentorId_moduleName: { batchId: batch.id, mentorId: mentor.id, moduleName: 'General Clinical Research' } },
    update: {},
    create: {
      batchId: batch.id,
      mentorId: mentor.id,
      moduleName: 'General Clinical Research'
    }
  });

  // 3. Seed Student User & Profile
  console.log('3. Seeding Student Account & Profile...');
  const studentUser = await prisma.user.upsert({
    where: { email: 'student@clinidea.in' },
    update: { password: hashedPassword, registeredCourse: 'Clinical Research & PV' },
    create: {
      fullName: 'Aarav Patel',
      phone: '9876543210',
      email: 'student@clinidea.in',
      password: hashedPassword,
      role: 'student',
      registeredCourse: 'Clinical Research & PV',
      registrationFeePaid: true,
      isRegistrationConfirmed: true
    }
  });

  const devStudent = await prisma.user.upsert({
    where: { email: 'student@example.com' },
    update: { password: hashedPassword, registeredCourse: 'Clinical Research & PV' },
    create: {
      fullName: 'Dev Test Student',
      phone: '9876500000',
      email: 'student@example.com',
      password: hashedPassword,
      role: 'student',
      registeredCourse: 'Clinical Research & PV',
      registrationFeePaid: true,
      isRegistrationConfirmed: true
    }
  });

  const studentUser1 = await prisma.user.upsert({
    where: { email: 'student1@clinidea.in' },
    update: { password: hashedPassword, registeredCourse: 'Clinical Research & PV' },
    create: {
      fullName: 'Sneha Deshmukh',
      phone: '9876543211',
      email: 'student1@clinidea.in',
      password: hashedPassword,
      role: 'student',
      registeredCourse: 'Clinical Research & PV',
      registrationFeePaid: true,
      isRegistrationConfirmed: true
    }
  });

  const studentUser2 = await prisma.user.upsert({
    where: { email: 'student2@clinidea.in' },
    update: { password: hashedPassword, registeredCourse: 'Clinical Research & PV' },
    create: {
      fullName: 'Rahul Sharma',
      phone: '9876543212',
      email: 'student2@clinidea.in',
      password: hashedPassword,
      role: 'student',
      registeredCourse: 'Clinical Research & PV',
      registrationFeePaid: true,
      isRegistrationConfirmed: true
    }
  });

  // Student Enrollments
  await prisma.enrollment.upsert({
    where: { id: 1 },
    update: { userId: studentUser.id, batchId: batch.id },
    create: {
      userId: studentUser.id,
      courseName: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)',
      batchId: batch.id,
      paymentType: 'installment',
      amount: 45000,
      totalFees: 45000,
      feesPaid: 45000,
      feesPending: 0,
      paymentStatus: 'completed',
      enrollmentStatus: 'approved'
    }
  });

  await prisma.enrollment.upsert({
    where: { id: 2 },
    update: { userId: studentUser1.id, batchId: batch.id },
    create: {
      userId: studentUser1.id,
      courseName: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)',
      batchId: batch.id,
      paymentType: 'installment',
      amount: 45000,
      totalFees: 45000,
      feesPaid: 25000,
      feesPending: 20000,
      paymentStatus: 'pending',
      enrollmentStatus: 'approved'
    }
  });

  await prisma.enrollment.upsert({
    where: { id: 3 },
    update: { userId: studentUser2.id, batchId: batch.id },
    create: {
      userId: studentUser2.id,
      courseName: 'Advanced Clinical Research & Pharmacovigilance (CR-PV)',
      batchId: batch.id,
      paymentType: 'installment',
      amount: 45000,
      totalFees: 45000,
      feesPaid: 45000,
      feesPending: 0,
      paymentStatus: 'completed',
      enrollmentStatus: 'approved'
    }
  });

  // 4. Seed Live Session & Attendance
  console.log('4. Seeding Live Sessions & Attendance...');
  const session = await prisma.classSession.create({
    data: {
      batchId: batch.id,
      mentorId: mentor.id,
      title: 'Module 1: Introduction to Good Clinical Practice (GCP)',
      sessionDate: new Date('2026-08-16T10:00:00Z'),
      sessionTime: '10:00 AM',
      meetingLink: 'https://meet.google.com/abc-defg-hij',
      status: 'upcoming'
    }
  });

  await prisma.attendance.create({
    data: {
      userId: studentUser.id,
      classSessionId: session.id,
      status: 'present'
    }
  });

  // 5. Seed LMS Study Content
  console.log('5. Seeding LMS Study Material...');
  await prisma.lMSContent.create({
    data: {
      batchId: batch.id,
      title: 'ICH-GCP E6(R2) Guidelines Manual',
      description: 'Official GCP Reference Document for Clinical Trials',
      contentType: 'pdf',
      category: 'Study Material',
      localFileUrl: '/uploads/ICH_GCP_Guidelines.pdf'
    }
  });

  await prisma.lMSContent.create({
    data: {
      batchId: batch.id,
      title: 'Pharmacovigilance Signal Detection Recording',
      description: 'Lecture video on ICSR reporting and signal evaluation',
      contentType: 'video',
      category: 'Recordings',
      localFileUrl: 'https://youtube.com/embed/demo-video-pv'
    }
  });

  // 6. Seed Exam & Student Result
  console.log('6. Seeding MCQ Exam & Result...');
  const exam = await prisma.batchExam.create({
    data: {
      batchId: batch.id,
      mentorId: mentor.id,
      title: 'GCP & Pharmacovigilance Mid-Term Exam 2026',
      totalMarks: 50,
      startTime: new Date('2026-08-10T09:00:00Z'),
      endTime: new Date('2026-08-10T11:00:00Z')
    }
  });

  await prisma.examQuestion.createMany({
    data: [
      {
        examId: exam.id,
        questionText: 'What does GCP stand for in clinical trials?',
        optionsJson: JSON.stringify(['Good Clinical Practice', 'Global Clinical Procedure', 'General Care Protocol', 'Good Care Process']),
        correctOption: 'Good Clinical Practice',
        marks: 25
      },
      {
        examId: exam.id,
        questionText: 'What is an Adverse Event (AE)?',
        optionsJson: JSON.stringify(['Any untoward medical occurrence in a patient', 'A confirmed drug side effect', 'An insurance claim', 'A missing trial document']),
        correctOption: 'Any untoward medical occurrence in a patient',
        marks: 25
      }
    ]
  });

  await prisma.examSubmission.create({
    data: {
      examId: exam.id,
      userId: studentUser.id,
      status: 'graded',
      totalScore: 50,
      timeTakenSeconds: 1240,
      submittedAt: new Date()
    }
  });

  // 7. Seed Student Assignment
  console.log('7. Seeding Assignment & Submission...');
  const assignment = await prisma.assignment.create({
    data: {
      batchId: batch.id,
      mentorId: mentor.id,
      title: 'Case Study 1: Serious Adverse Event (SAE) Narrative Writing',
      description: 'Draft a 1-page SAE narrative for a patient experiencing Grade 3 hepatotoxicity during Phase II trial.',
      totalMarks: 100,
      dueDate: new Date('2026-08-25')
    }
  });

  await prisma.assignmentSubmission.create({
    data: {
      assignmentId: assignment.id,
      userId: studentUser.id,
      fileUrl: '/uploads/student_sae_narrative.pdf',
      status: 'graded',
      marksObtained: 92,
      mentorFeedback: 'Excellent SAE narrative structure and MedDRA coding!'
    }
  });

  // 8. Seed Fee Payments & Receipts
  console.log('8. Seeding Payment Receipts...');
  await prisma.payment.deleteMany({});
  await prisma.payment.createMany({
    data: [
      { userId: studentUser.id, courseName: course.name, amount: 5000, paymentType: 'registration', paymentStatus: 'completed', transactionId: 'TXN10001', receiptNumber: 5001 },
      { userId: studentUser.id, courseName: course.name, amount: 20000, paymentType: 'installment_1', paymentStatus: 'completed', transactionId: 'TXN10002', receiptNumber: 5002 },
      { userId: studentUser.id, courseName: course.name, amount: 20000, paymentType: 'installment_2', paymentStatus: 'completed', transactionId: 'TXN10003', receiptNumber: 5003 }
    ]
  });

  // 9. Seed Approved Certificates
  console.log('9. Seeding Approved Certificates...');
  await prisma.certificate.deleteMany({});
  await prisma.certificate.createMany({
    data: [
      { userId: studentUser.id, courseId: course.id, batchId: batch.id, certificateType: 'course_completion', certificateId: 'CLIN-CC-2026-101', issueDate: new Date(), fileUrl: '/certificates/completion.pdf', status: 'approved' },
      { userId: studentUser.id, courseId: course.id, batchId: batch.id, certificateType: 'gcp', certificateId: 'CLIN-GCP-2026-101', issueDate: new Date(), fileUrl: '/certificates/gcp.pdf', status: 'approved' },
      { userId: studentUser.id, courseId: course.id, batchId: batch.id, certificateType: 'internship', certificateId: 'CLIN-INT-2026-101', issueDate: new Date(), fileUrl: '/certificates/internship.pdf', status: 'approved' }
    ]
  });

  // 10. Seed Student Coordinator Leads Pipeline
  console.log('10. Seeding Coordinator Course & Webinar Leads...');
  await prisma.lead.deleteMany({});
  await prisma.lead.createMany({
    data: [
      { name: 'Dr. Rahul Deshmukh', phone: '9876500001', email: 'rahul.d@gmail.com', courseInterest: 'Clinical Research & PV', source: 'Google Ads', stage: 'NEW', webinarStage: 'NEW', assignedCoordinatorId: coordinator.id },
      { name: 'Pooja Kulkarni', phone: '9876500002', email: 'pooja.k@gmail.com', courseInterest: 'Pharmacovigilance', source: 'Meta Ads', stage: 'CONTACTED', webinarStage: 'CONTACTED_WEBINAR', assignedCoordinatorId: coordinator.id },
      { name: 'Siddharth Varma', phone: '9876500003', email: 'siddharth.v@gmail.com', courseInterest: 'Clinical Data Management', source: 'Website', stage: 'INTERESTED', webinarStage: 'INTERESTED_COURSE', assignedCoordinatorId: coordinator.id },
      { name: 'Neha Sharma', phone: '9876500004', email: 'neha.s@gmail.com', courseInterest: 'Medical Writing', source: 'Social Media', stage: 'NOT_INTERESTED', notInterestedReason: 'Looking for distance course only', webinarStage: 'NOT_INTERESTED', assignedCoordinatorId: coordinator.id },
      { name: 'Vikram Joshi', phone: '9876500005', email: 'vikram.j@gmail.com', courseInterest: 'CR PV CDM Combo', source: 'Webinar', stage: 'REG_FEE_RECEIVED', webinarStage: 'REG_FEE_RECEIVED', assignedCoordinatorId: coordinator.id }
    ]
  });

  console.log('--- ✅ FULL DEMO DATA SEEDED SUCCESSFULLY! ---');
}

seedFullDemo()
  .catch(e => { console.error('Error seeding demo data:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

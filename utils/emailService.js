const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.EMAIL_PORT) || 465,
  secure: parseInt(process.env.EMAIL_PORT) === 465, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const adminEmail = process.env.ADMIN_EMAIL || 'Admin@clinidea.in';

// Reusable template wrapper for premium look
const wrapHtml = (title, content) => `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; color: #333; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
  .header { background: linear-gradient(135deg, #1e5eff, #0044ff); padding: 30px; text-align: center; color: white; }
  .header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
  .content { padding: 40px 30px; line-height: 1.6; }
  .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
  .btn { display: inline-block; padding: 12px 25px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
  .receipt-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
  .receipt-row { display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 10px 0; }
  .receipt-row:last-child { border-bottom: none; font-weight: bold; font-size: 1.1em; color: #1e5eff; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Clinidea Education. All rights reserved.<br>
      For support, contact info@clinidea.in or WhatsApp +91 89992 13129
    </div>
  </div>
</body>
</html>
`;

const sendEmail = async (to, subject, htmlContent, attachmentPath = null) => {
  try {
    const mailOptions = {
      from: `"Clinidea Education" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent
    };
    if (attachmentPath) {
      mailOptions.attachments = [{
        filename: require('path').basename(attachmentPath),
        path: attachmentPath
      }];
    }
    await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Sent email to ${to} - Subject: ${subject}`);
  } catch (error) {
    console.error(`[EmailService] Failed to send email to ${to}:`, error);
  }
};

const sendRegistrationReceipt = async (user, amount, transactionId, pdfPath = null) => {
  const content = `
    <h3>Hello ${user.fullName},</h3>
    <p>Welcome to Clinidea Education! Your registration fee has been successfully processed.</p>
    <div class="receipt-box">
      <div class="receipt-row"><span>Student Name</span><span>${user.fullName}</span></div>
      <div class="receipt-row"><span>Course</span><span>${user.registeredCourse || 'Not Selected'}</span></div>
      <div class="receipt-row"><span>Transaction ID</span><span>${transactionId || 'N/A'}</span></div>
      <div class="receipt-row"><span>Date</span><span>${new Date().toLocaleDateString()}</span></div>
      <div class="receipt-row"><span>Amount Paid</span><span>₹${amount}</span></div>
    </div>
    <p>We are excited to have you on board. You can now log into your student dashboard using your credentials.</p>
    <a href="https://clinidea.in/login" class="btn">Login to Dashboard</a>
  `;
  await sendEmail(user.email, "Registration Successful & Fee Receipt - Clinidea Education", wrapHtml("Registration Confirmation", content), pdfPath);
  await sendEmail(adminEmail, "New Registration Alert", wrapHtml("New Registration", `<p>Student <b>${user.fullName}</b> (${user.phone}) has just paid the registration fee.</p>`));
};

const sendEnrollmentReceipt = async (user, enrollment, transactionId, pdfPath = null) => {
  const content = `
    <h3>Hello ${user.fullName},</h3>
    <p>Your enrollment payment for <strong>${enrollment.courseName}</strong> has been successfully verified.</p>
    <div class="receipt-box">
      <div class="receipt-row"><span>Course</span><span>${enrollment.courseName}</span></div>
      <div class="receipt-row"><span>Transaction ID</span><span>${transactionId || 'N/A'}</span></div>
      <div class="receipt-row"><span>Payment Type</span><span>${enrollment.paymentType}</span></div>
      <div class="receipt-row"><span>Date</span><span>${new Date().toLocaleDateString()}</span></div>
      <div class="receipt-row"><span>Amount Paid</span><span>₹${enrollment.amount}</span></div>
    </div>
    <p>Your seat in the upcoming batch is secured. You will receive further instructions shortly.</p>
  `;
  await sendEmail(user.email, "Enrollment Confirmation & Fee Receipt", wrapHtml("Enrollment Confirmed", content), pdfPath);
  await sendEmail(adminEmail, "New Enrollment Alert", wrapHtml("New Enrollment", `<p>Student <b>${user.fullName}</b> has just completed an enrollment payment of ₹${enrollment.amount} for ${enrollment.courseName}.</p>`));
};

const sendEnquiryThankYou = async (lead) => {
  const content = `
    <h3>Hello ${lead.name},</h3>
    <p>Thank you for showing interest in Clinidea Education.</p>
    <p>We have received your enquiry regarding <strong>${lead.courseInterest || 'our clinical courses'}</strong>. Our career counseling team will get in touch with you shortly to assist you.</p>
    <p>If you have any urgent questions, you can click the button below to message us directly on WhatsApp.</p>
    <a href="https://wa.me/918999213129?text=Hi%20Clinidea,%20I%20just%20submitted%20an%20enquiry." class="btn" style="background:#25D366;">Chat on WhatsApp</a>
  `;
  await sendEmail(lead.email, "Thank You for Contacting Clinidea Education", wrapHtml("Enquiry Received", content));
  await sendEmail(adminEmail, "New Lead Enquiry", wrapHtml("New Lead Received", `
    <p><strong>Name:</strong> ${lead.name}</p>
    <p><strong>Phone:</strong> ${lead.phone}</p>
    <p><strong>Email:</strong> ${lead.email}</p>
    <p><strong>Course:</strong> ${lead.courseInterest}</p>
    <p><strong>Message:</strong> ${lead.message || 'N/A'}</p>
  `));
};

const sendQuizResult = async (attempt, score, totalMarks, eventTitle) => {
  const content = `
    <h3>Hello ${attempt.name},</h3>
    <p>Thank you for participating in the <strong>${eventTitle}</strong> quiz assessment!</p>
    <div class="receipt-box" style="text-align: center;">
      <h2 style="color: #1e5eff; margin: 0;">Your Score</h2>
      <h1 style="color: #10b981; margin: 10px 0; font-size: 3em;">${score} <span style="font-size: 0.5em; color: #64748b;">/ ${totalMarks}</span></h1>
    </div>
    <p>Our team will contact you shortly regarding the next steps.</p>
  `;
  await sendEmail(attempt.email, `Your Quiz Results: ${eventTitle}`, wrapHtml("Quiz Assessment Result", content));
  await sendEmail(adminEmail, `Quiz Submitted by ${attempt.name}`, wrapHtml("Quiz Submission", `<p>${attempt.name} (${attempt.phone}) scored <b>${score}/${totalMarks}</b> in ${eventTitle}.</p>`));
};

const sendEnquiryReminder = async (lead, reminderNumber) => {
  let text = '';
  switch(reminderNumber) {
    case 1:
      text = `<p>We noticed you recently enquired about our courses but haven't taken the next step. Our batches are filling up fast! Do you have any doubts we can clarify?</p>`;
      break;
    case 2:
      text = `<p>Just checking in! Clinidea Education offers 100% placement assistance and industry-recognized clinical research programs. Are you ready to accelerate your career?</p>`;
      break;
    case 3:
      text = `<p>This is a quick reminder that our upcoming batch registrations will be closing soon. Don't miss out on securing your seat.</p>`;
      break;
    case 4:
      text = `<p>We haven't heard from you! If you're still interested, please reply to this email or message us on WhatsApp. Otherwise, we'll stop bothering you. Wishing you the best!</p>`;
      break;
  }
  
  const content = `
    <h3>Hello ${lead.name},</h3>
    ${text}
    <a href="https://wa.me/918999213129?text=Hi%20Clinidea,%20I%20have%20a%20question%20about%20the%20course." class="btn" style="background:#25D366;">Ask on WhatsApp</a>
    <a href="https://clinidea.in/program" class="btn" style="margin-left:10px;">Explore Courses</a>
  `;
  await sendEmail(lead.email, `Following up on your interest - Clinidea Education`, wrapHtml("Just checking in!", content));
};

module.exports = {
  sendRegistrationReceipt,
  sendEnrollmentReceipt,
  sendEnquiryThankYou,
  sendQuizResult,
  sendEnquiryReminder
};

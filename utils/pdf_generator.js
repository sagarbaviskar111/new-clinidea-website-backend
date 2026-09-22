const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Generated PDFs (receipts, certificates, application forms) stay on local disk —
// Cloudinary's account security settings block public PDF delivery (401), so
// these are kept out of that migration for now.
function savePdfLocally(buffer, subDir, fileName) {
  const dir = path.join(__dirname, '..', 'uploads', subDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return `/uploads/${subDir}/${fileName}`;
}

// Must stay identical to TERMS_AND_CONDITIONS_TEXT in frontend/src/pages/Register.jsx —
// the same text the student ticks "I agree" to on Step 3 is embedded in their downloaded copy.
const TERMS_AND_CONDITIONS_TEXT = `
TERMS AND CONDITIONS
GOVERNING STUDENT ADMISSION, ENROLLMENT, FEES AND COURSE PARTICIPATION
Effective Date: 21-Sep-2026
Version: 1.0

1. DEFINITIONS AND INTERPRETATION
In these Terms and Conditions ("Terms"), unless the context otherwise requires:
"Institute" / "Clinidea" / "We" / "Us" means Clinidea Education, its owners, partners, directors, employees, coordinators, mentors, trainers and authorised representatives, and includes its website, learning management system ("LMS"), and all associated online and offline touchpoints.
"Student" / "You" means the individual applying for, enrolling in, or admitted to any course, program or batch conducted by the Institute, and where the Student is a minor, includes the Student's parent/legal guardian who has co-signed the Admission Form.
"Course" means any program, certificate course, workshop, batch or training module offered by the Institute, whether delivered live online, in recorded/self-paced form, or in a blended format.
"Admission Form" means the official enrollment/registration form (physical or digital) executed by the Student, together with these Terms, the Fee Schedule and any annexures thereto.
"Fee" / "Course Fee" means the total consideration payable by the Student for a Course, as set out in the Fee Schedule annexed to the Admission Form, and includes the Registration Fee and all Installments.
"Registration Fee" / "Admission Fee" means the initial, non-refundable amount paid at the time of admission to confirm and reserve the Student's seat in a batch.
"LMS" means the Institute's learning management system, portal, app or any third-party platform through which course content, recordings, assessments or communication is delivered.
"Authorised Signatory" means a person specifically designated in writing by the Institute's management to bind the Institute contractually. For the avoidance of doubt, this does not include sales counsellors, coordinators, mentors or admission staff acting outside such written authorisation.
"Batch" means the specific group/cohort and schedule to which the Student is allotted at the time of admission.

2. ACCEPTANCE OF TERMS
2.1 By submitting the Admission Form, making any payment towards the Course Fee, accessing the LMS, or attending even a single session/orientation of any Course, the Student unconditionally and irrevocably accepts these Terms in their entirety. These Terms constitute a legally binding agreement between the Student and the Institute.
2.2 These Terms shall prevail over any advertisement, brochure, social media post, verbal statement, or any representation made by any sales counsellor, coordinator, mentor or other staff member of the Institute that is inconsistent with these Terms, unless such variation is confirmed in writing and signed by an Authorised Signatory of the Institute.
2.3 The Student confirms that they have read, understood and had a reasonable opportunity to seek clarification on these Terms and the Fee Schedule prior to making any payment, and that they are entering into this agreement voluntarily and with full understanding of its financial and academic obligations.

3. ELIGIBILITY FOR ADMISSION
3.1 Admission to a Course is subject to the eligibility criteria (educational qualification, age, documents, etc.) specified for that Course. The Institute reserves the right to verify all information and documents submitted by the Student and to cancel the admission, without refund of the Registration Fee, if any information or document is found to be false, forged or misleading.
3.2 Where the Student is below 18 years of age, the Admission Form and these Terms must additionally be signed by the Student's parent/legal guardian, who shall be jointly and severally liable, along with the Student, for all payment obligations under these Terms.

4. ADMISSION AND ENROLLMENT PROCESS
4.1 A seat in a Batch is confirmed only upon (a) submission of a duly completed and signed Admission Form, and (b) receipt of the Registration Fee (and, where applicable, the first Installment) by the Institute through an Approved Payment Mode (defined in Clause 5.5). No seat is reserved on the basis of an informal enquiry, verbal assurance, or WhatsApp/e-mail conversation alone.
4.2 The Institute reserves the right, at its sole discretion, to accept or reject any application for admission without assigning any reason, and to allot, re-allot, merge, split, postpone, or reschedule Batches based on operational requirements, provided that reasonable prior notice is given to affected Students.
4.3 Any discount, waiver, scholarship, or special payment plan offered to a Student is valid only if confirmed in writing by an Authorised Signatory and is not transferable to any other person or Course.

5. COURSE FEES AND PAYMENT TERMS
5.1 Total Fee and Fee Schedule
The total Course Fee, the number and amount of Installments, and the due date of each Installment shall be as set out in the Fee Schedule annexed to the Admission Form and/or communicated in writing (including by e-mail or through the LMS) at the time of admission. The Fee Schedule forms an integral part of these Terms.
5.2 Registration / Admission Fee
The Registration Fee is charged towards processing the application, reserving the Student's seat in a Batch, and administrative costs already incurred by the Institute. The Registration Fee is strictly non-refundable and non-transferable under any circumstances, including if the Student subsequently decides not to join the Course or is unable to attend.
5.3 Installments and Due Dates
All Installments are payable strictly on or before the due dates specified in the Fee Schedule, irrespective of the Student's attendance, satisfaction level, or personal circumstances.
The obligation to pay each Installment is independent of the number of classes actually attended by the Student and is not contingent upon continued attendance.
The Institute may, at its sole discretion and on written request, grant a one-time extension of up to 7 days for a specific Installment. Repeated requests for extension will not ordinarily be entertained and may be declined without reason.
5.4 Consequences of Delay or Default in Payment
Where any Installment remains unpaid beyond its due date, the Institute may, without further notice: (a) suspend the Student's access to live classes, recordings and the LMS; (b) withhold assessment results, mark-sheets and the Course completion certificate; and/or (c) charge a late-payment fee of 2% per month (or part thereof) on the overdue amount, or a flat late fee of ₹1,000, whichever is higher, as reasonable compensation for delay, and not as a penalty.
Continued non-payment for a period exceeding 15 days from the due date shall entitle the Institute to treat the enrollment as discontinued by the Student (see Clause 7) and to initiate recovery proceedings for the outstanding amount along with applicable interest and reasonable costs of recovery, through legal notice, arbitration/civil suit, or engagement of a recovery/collection agency, without prejudice to any other right or remedy available to the Institute.
A payment screenshot, UPI reference number, or any unverified proof shared by the Student shall not be treated as confirmation of payment until the amount is actually realised and reconciled in the Institute's bank account/payment gateway and reflected in the Institute's official records (CRM/LMS). The Student is responsible for retaining valid proof of payment and promptly reporting any discrepancy between payment made and the Institute's records within [7] days of the transaction.
5.5 Approved Payment Modes
Fees shall be paid only through the official payment channels notified by the Institute (registered bank account, payment gateway/link, or POS at the Institute's office), and a valid receipt/invoice shall be issued for each payment. Any payment made in cash, or into any account/person not officially authorised by the Institute in writing, is made entirely at the Student's own risk, and the Institute shall not be liable for any such payment or be bound to treat it as received.
5.6 Duplicate Entries / Reconciliation Errors
In the event of a bona fide error such as a duplicate payment entry, wrong amount recorded, or a payment not reflecting in the Student's CRM/LMS account despite actual receipt, the Student must notify the Institute in writing (with proof) within [7] days of noticing the discrepancy. The Institute shall investigate and rectify genuine errors within a reasonable time, and any excess amount found to be paid shall be adjusted against future dues or refunded, at the Institute's discretion, after due verification.
5.7 Chargebacks and Payment Reversals
The Student agrees not to initiate any chargeback, payment reversal, or dispute with their bank/card issuer/payment app in respect of any amount validly due and payable under these Terms and for which the Institute has provided or made available the corresponding Course access. An unauthorised or bad-faith chargeback shall be treated as a default in payment under Clause 5.4, in addition to any other remedy available to the Institute including recovery of the reversed amount, bank/gateway charges, and legal costs.

6. REFUND AND CANCELLATION POLICY
6.1 Cooling-Off Period
A Student who wishes to withdraw within 3 calendar days of the date of admission and before attending more than 1 live session/orientation may do so by submitting a written cancellation request. In such a case, the Registration Fee (₹10,000) shall remain non-refundable, but any Installment(s) already paid (less a processing charge of 5% or ₹2,000, whichever is higher, towards administrative and resource costs already incurred) shall be refunded within 15 working days.
6.2 Cancellation After the Cooling-Off Period
Once the cooling-off period under Clause 6.1 has lapsed, or once the Student has attended more than 1 session, no refund of any amount already paid (Registration Fee or Installments) shall be made, whether the withdrawal is on account of personal, financial, medical or any other reason, save where the withdrawal is directly attributable to a material and continuing failure of the Institute to deliver the Course as described (see Clause 6.4).
6.3 No Refund for Dissatisfaction Post-Delivery
Since the Course involves access to curated content, mentor time, batch allocation and administrative resources committed in advance, no refund shall be payable merely on the ground that the Student is dissatisfied with the pace, style, or perceived quality of teaching, provided the Course is being delivered substantially in accordance with the published curriculum. The Student's specific concerns should first be raised through the Grievance Redressal process under Clause 17.
6.4 Cancellation/Refund on Account of the Institute
If the Institute permanently discontinues a Course after commencement for reasons within its control, without offering an equivalent alternative Batch, mentor, or make-up sessions, the Student shall be entitled to a pro-rata refund of fees paid for the portion of the Course not delivered, calculated on a straight-line basis over the total course duration, within 30 days of such discontinuation.
6.5 No Cash Refunds
All permissible refunds under this Clause 6 shall be made only to the original source/bank account from which payment was received, by way of bank transfer, and not in cash.

7. DISCONTINUATION / WITHDRAWAL BY THE STUDENT
7.1 Written Withdrawal Required
Mere non-attendance, silence, or ceasing communication with the mentor/coordinator does NOT constitute withdrawal from the Course. A Student shall be deemed enrolled, and all payment obligations under the Fee Schedule shall continue to accrue and remain due, until the Student submits a formal written withdrawal request (by e-mail to the Institute's official admissions e-mail ID) and the Institute acknowledges the same in writing.
7.2 Fee Liability on Discontinuation
If a Student discontinues the Course after enrollment, for any reason whatsoever (including change of mind, personal or financial reasons, dissatisfaction, or inability to continue), the Student shall remain liable to pay 50% (half) of the Total Course Fee as per the Fee Schedule ("Discontinuation Charge"), regardless of the number of Installments actually paid or classes attended as on the date of discontinuation, unless a lesser amount is agreed in writing by an Authorised Signatory.
The Discontinuation Charge is recorded here as a genuine, pre-estimated measure of the loss and administrative cost reasonably incurred by the Institute on account of early withdrawal (seat blocking, batch planning, mentor allocation, material/LMS access already provisioned), and not as a penalty for breach.
Where a Student discontinues the Course and fails to pay the Discontinuation Charge within 15 days of the written withdrawal request (or within 15 days of the Institute treating the enrollment as discontinued under Clause 5.4), the Student shall face legal consequences, including recovery proceedings through a legal notice, arbitration or civil suit, and/or engagement of a recovery/collection agency, and shall be liable for the outstanding amount together with applicable interest and reasonable costs of recovery, without prejudice to any other right or remedy available to the Institute.
For the avoidance of doubt, once the full Course Fee has actually been collected by the Institute prior to discontinuation, no part of it becomes refundable by virtue of discontinuation (see Clause 6.2), and this Clause 7.2 applies only to amounts that would otherwise still have fallen due.
7.3 Batch Change, Pause or Transfer Requests
Any request to pause enrollment, shift to a future/different Batch, or transfer the seat to another individual is not a matter of right and shall be considered only on a written request, subject to seat availability and payment of an administrative fee of ₹2,000. Approval of any such request lies at the sole discretion of the Institute and does not, by itself, waive any Fee already due. An approved batch transfer/pause does not extend the overall validity of LMS access beyond 3 months from the original Course end date unless separately agreed in writing.
7.4 Effect on LMS Access
On acceptance of a withdrawal request, or on default under Clause 5.4, the Institute shall be entitled to immediately suspend or terminate the Student's access to the LMS, live classes and recordings. No further content shall be made available, and no certificate shall be issued, until all outstanding dues (including any Discontinuation Charge) have been cleared in full.

8. ATTENDANCE, ASSESSMENTS AND CERTIFICATION
8.1 The Student is required to maintain a minimum attendance of 75% of the scheduled live sessions (or complete the equivalent recorded sessions) and to complete all mandatory assignments/assessments prescribed for the Course.
8.2 A Course completion certificate shall be issued only where the Student has: (a) satisfied the minimum attendance requirement under Clause 8.1; (b) completed all mandatory assessments to the satisfaction of the Institute; and (c) cleared the entire Course Fee, including any late fee or Discontinuation Charge payable. Non-fulfilment of any of these conditions shall entitle the Institute to withhold the certificate, notwithstanding completion of the Course duration.
8.3 Unless expressly stated otherwise in the Course description, the certificate issued by the Institute is an internal certificate of training/participation and does not constitute a government-recognised degree, diploma, or statutory professional qualification, nor a guarantee of employment, licensure, or industry accreditation. The Student acknowledges having understood the specific nature and recognition (if any) of the certificate for the Course enrolled in, prior to admission.
8.4 Any request for correction of a factual error in the name/details printed on an issued certificate must be raised in writing within [30] days of issuance; re-issuance thereafter may attract an administrative charge.

9. COURSE CONTENT, SCHEDULE AND DELIVERY
9.1 The Institute shall make reasonable efforts to deliver the Course substantially in accordance with the published curriculum and schedule. However, the Institute reserves the right to modify the curriculum, add/remove topics, change the mentor/trainer, or alter the schedule of any session, where reasonably necessary for academic, operational or logistical reasons, including mentor unavailability, low enrolment, or force majeure events, provided that the overall learning outcomes of the Course are not materially reduced.
9.2 Where a live session cannot be conducted as scheduled due to a technical issue, platform failure, or mentor unavailability, the Institute shall reschedule the session or provide a recorded session/alternative arrangement within a reasonable time, and such rescheduling shall not, by itself, entitle the Student to any fee refund or reduction.
9.3 The Student acknowledges the distinction between recorded/self-paced content and live mentor-led sessions, and between any simulator/practice software used for training purposes and actual industry-grade software, and agrees that access to a simulator or training environment does not represent, and should not be understood as, certification on any specific commercial or industry software product unless expressly stated.

10. STUDENT CODE OF CONDUCT
Attend sessions punctually and engage respectfully with mentors, coordinators, and fellow students, without any form of harassment, abuse, or discriminatory behaviour.
Refrain from any inappropriate, abusive, or unauthorised communication with mentors/trainers outside of official channels, and immediately report any such conduct by staff to the Institute's grievance contact.
Not misuse, disrupt, or attempt unauthorised access to the LMS, any third-party software, or the Institute's systems.
The Institute reserves the right to suspend or terminate, with immediate effect and without refund of any fee paid, the enrollment of any Student found to be in serious or repeated breach of this Code of Conduct, after providing the Student a reasonable opportunity to respond.

11. LMS ACCESS, INTELLECTUAL PROPERTY AND CONFIDENTIALITY
11.1 Personal, Non-Transferable Access
LMS login credentials are issued to the Student personally and must not be shared with, sold to, or used by any other person. The Student is fully responsible for maintaining the confidentiality of their credentials and for all activity conducted through their account, whether or not authorised by the Student.
11.2 Prohibited Actions
Downloading, recording, screen-capturing, printing, or otherwise reproducing recorded sessions, presentations, question banks, assignments, or any other course material, except where expressly permitted in writing for personal study.
Circulating, forwarding, uploading, or reselling any course material, recordings, or LMS content on WhatsApp, Telegram, YouTube, file-sharing platforms, or any other medium, whether free of charge or for consideration.
Sharing database, software, or tool credentials provided for training purposes with any unauthorised person, or permitting any unauthorised person to access the same.
11.3 Intellectual Property
All course content, curriculum, presentations, recordings, question banks, branding, and material made available through the LMS or otherwise are and shall remain the exclusive intellectual property of the Institute (or its licensors). Enrollment grants the Student only a limited, non-exclusive, non-transferable licence to access such material for personal learning during the currency of the Course, and no ownership or further right is transferred.
11.4 Consequences of Breach
Any breach of this Clause 11 shall entitle the Institute, without prejudice to any other remedy, to immediately suspend or terminate the Student's LMS access and enrollment without refund, and to pursue civil and/or criminal remedies for breach of confidentiality, copyright infringement, or unauthorised access, including recovery of damages and costs, against the Student and any third party knowingly involved.
11.5 Duration of Access
LMS access shall be provided for the duration of the 6-month Course plus 3 months thereafter, and shall be automatically suspended immediately upon discontinuation, withdrawal, or default in payment by the Student, and in any event upon expiry of such period, regardless of whether the Student has reviewed all content.

12. USE OF THIRD-PARTY SOFTWARE, TOOLS AND DATABASES
12.1 Where the Course involves access to any third-party software, tool, database, or simulator, such access is provided solely for training purposes, strictly in accordance with the terms of the Institute's licence/permission with the relevant provider, and only for the duration approved by the Institute.
12.2 The Student shall not use such access for any purpose other than bona fide training, shall not share credentials with any unauthorised person, and shall not extract, copy, or use any data accessed thereby for any commercial or personal purpose outside the Course.
12.3 The Institute shall revoke all such third-party access promptly upon the Student's discontinuation, completion of the Course, or default in payment. The Student shall be personally liable for any loss, penalty, or third-party claim arising from their unauthorised use or sharing of such access.

13. PLACEMENT ASSISTANCE — DISCLAIMER
13.1 Where the Course includes a placement assistance component, the Institute shall provide reasonable support such as resume guidance, interview preparation, and introductions to prospective employers/hiring partners. This constitutes placement ASSISTANCE only and is not, and shall not be construed as, a guarantee, warranty, or assurance of a job offer, a minimum salary/package, or employment of any kind.
13.2 Any reference to placement statistics, average packages, or hiring partners in promotional material is indicative of past outcomes for illustrative purposes only and is not a representation as to the outcome for any individual Student, whose employability depends on multiple factors including their own performance, skills, and market conditions outside the Institute's control.
13.3 The Student is responsible for actively applying to and appearing for interview opportunities shared by the Institute, within their stated eligibility. Non-response to, or rejection of, a shared opportunity by the Student shall not entitle the Student to claim non-performance of placement assistance by the Institute. The Student agrees to promptly inform the Institute upon securing any placement (whether through the Institute or independently) to enable accurate record-keeping.
13.4 Clarification on "100% Assured Placement Support": Where the Institute's promotional material refers to "100% Assured Placement Support" or similar language, this expression means that the Institute shall continue to provide the placement assistance described in Clause 13.1 (resume support, interview preparation, and sharing of suitable job opportunities) on an ongoing basis until the Student secures employment or the Student discontinues engaging with the placement process, whichever is earlier. It is expressly clarified that this expression does NOT mean, warrant, or guarantee that any specific Student will receive a job offer, a minimum salary/package, or employment within any particular timeframe, employment outcomes being dependent on factors such as the Student's own performance, market conditions, and the hiring decisions of third-party employers which are outside the Institute's control.

14. MARKETING AND PROMOTIONAL MATERIAL
14.1 Advertisements, brochures, website content and social media posts are prepared for general informational and promotional purposes and are subject to change. In the event of any inconsistency between such promotional material and these Terms (including the specific Course description shared at the time of admission), these Terms and the specific written Course description shall prevail.
14.2 No sales counsellor, coordinator, or staff member is authorised to make any binding commitment, discount, or guarantee (including as to placement, certification, or outcomes) on behalf of the Institute beyond what is expressly stated in these Terms or confirmed separately in writing by an Authorised Signatory. The Student is encouraged to seek written confirmation of any specific representation made to them before making payment.

15. OFFICIAL COMMUNICATION
15.1 All binding communication, notices, approvals, or variations to these Terms shall be made only through the Institute's official e-mail ID / LMS notification / written letter. Conversations on WhatsApp, phone calls, or verbal discussions with mentors, coordinators, or sales staff are for convenience only and do not, by themselves, create a binding obligation on the Institute unless confirmed in writing by an Authorised Signatory.
15.2 The Student is responsible for keeping the Institute updated with their current contact e-mail and phone number, and for regularly checking official communication channels for fee reminders, schedule changes, and other notices.

16. DATA PRIVACY AND PROTECTION
16.1 The Institute collects and processes the Student's personal data (including name, contact details, educational records, payment information, and, where applicable, identity documents) for the purposes of admission processing, fee collection, academic administration, certification, and placement assistance, in accordance with the Digital Personal Data Protection Act, 2023 and other applicable law.
16.2 The Institute shall take reasonable technical and organisational measures to protect the Student's personal data against unauthorised access, and shall restrict access to such data internally to staff who require it for the purposes stated above.
16.3 The Institute shall not sell or share the Student's personal data with any unrelated third party for commercial purposes without the Student's consent, save that data may be shared with genuine hiring/placement partners for placement assistance, payment processors for fee collection, and as required by law or a competent authority.
16.4 The Student agrees not to publicly circulate screenshots of private communications, payment details, or personal information relating to any other Student, mentor, or staff member of the Institute obtained in the course of the program.

17. GRIEVANCE REDRESSAL
17.1 Any complaint or grievance relating to academics, mentor conduct, fees, or any other matter shall first be raised in writing to the Institute's designated grievance e-mail ID: admin@clinidea.in. The Institute shall acknowledge the complaint within 3 working days and endeavour to resolve it within 15 working days.
17.2 The Student agrees to exhaust this internal grievance process in good faith before taking any dispute to a public forum (including social media or review platforms) or initiating legal proceedings, save where the matter involves a genuine safety or statutory concern requiring immediate external escalation.

18. FORCE MAJEURE
Neither party shall be liable for any delay or failure in performance of its obligations under these Terms (including delivery of scheduled sessions) to the extent such delay or failure is caused by circumstances beyond its reasonable control, including natural disaster, pandemic, government action/lockdown, internet or power outage, strike, or failure of a third-party platform. The Institute shall make reasonable efforts to reschedule affected sessions once such circumstances cease.

19. LIMITATION OF LIABILITY
19.1 The Institute's total liability to the Student under or in connection with these Terms and the Course, whether in contract, tort or otherwise, shall not exceed the total Course Fee actually paid by the Student for the specific Course giving rise to the claim.
19.2 The Institute shall not be liable for any indirect, incidental, or consequential loss, including loss of income, business opportunity, or anticipated placement outcome, arising from the Student's participation in, or discontinuation of, the Course.

20. FAIR COMMENT AND MISUSE OF INFORMATION
20.1 Nothing in these Terms restricts the Student's right to give honest, good-faith feedback or file a genuine complaint with a consumer forum or regulatory authority. However, the Student agrees not to knowingly publish false or misleading statements about the Institute, its mentors, or staff on any public platform, and agrees to first use the Grievance Redressal process under Clause 17 for fee, refund, or service-related concerns.
20.2 The Institute likewise agrees not to publicly disclose any Student's personal or fee-payment information in connection with any dispute, save as required for legitimate legal recovery proceedings.

21. GOVERNING LAW, DISPUTE RESOLUTION AND JURISDICTION
21.1 These Terms shall be governed by and construed in accordance with the laws of India.
21.2 Any dispute arising out of or in connection with these Terms, the Admission Form, or the Course, which is not resolved through the Grievance Redressal process under Clause 17, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator appointed by the Institute, with the seat and venue of arbitration at Jabalpur, Madhya Pradesh, and the proceedings shall be conducted in English. This shall not preclude either party from approaching the appropriate consumer forum where the dispute qualifies as a consumer dispute under applicable law.
21.3 Subject to Clause 21.2, the courts at Jabalpur, Madhya Pradesh alone shall have exclusive jurisdiction over any matter arising out of these Terms.

22. GENERAL PROVISIONS
22.1 Amendment: The Institute may revise these Terms from time to time for future admissions by publishing the updated version on its website with a revised effective date. For a Student already admitted, the Terms in force at the time of that Student's admission shall continue to apply, unless a change is required by law or is more beneficial to the Student.
22.2 Entire Agreement: The Admission Form, these Terms, and the annexed Fee Schedule together constitute the entire agreement between the Student and the Institute in relation to the Course, and supersede all prior discussions, negotiations, and representations, whether oral or written.
22.3 Severability: If any clause of these Terms is held invalid or unenforceable by a court or tribunal of competent jurisdiction, the remaining clauses shall continue in full force and effect, and the invalid clause shall be replaced with a valid clause that most closely reflects its original commercial intent.
22.4 No Waiver: No failure or delay by the Institute in exercising any right under these Terms shall operate as a waiver of that right.
22.5 Assignment: The Student may not assign or transfer their rights or obligations under these Terms to any other person without the prior written consent of the Institute.

23. STUDENT / GUARDIAN DECLARATION
I/We confirm that I/we have read and understood the above Terms and Conditions in their entirety, including the fee, refund, discontinuation, LMS-usage, and placement-related clauses, and I/we voluntarily agree to be bound by them. I/we understand that this is a binding agreement and that the obligation to pay the agreed Course Fee, as per the schedule, survives any decision on my/our part to discontinue the Course.
`.trim();

const escapeHtml = (str) => String(str)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Turns the flat TERMS_AND_CONDITIONS_TEXT block into structured HTML (title block,
// numbered major headings, short sub-clause headings, and body paragraphs) so the
// downloaded PDF reads like a real legal document instead of one dense wall of text.
function renderTermsHtml(text) {
  const lines = text.split('\n');
  let i = 0;

  const titleLines = [];
  while (i < lines.length && lines[i].trim() !== '') {
    titleLines.push(lines[i].trim());
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;

  let html = '<div class="terms-title-block">';
  html += `<div class="terms-main-title">${escapeHtml(titleLines[0] || 'TERMS AND CONDITIONS')}</div>`;
  if (titleLines[1]) html += `<div class="terms-subtitle">${escapeHtml(titleLines[1])}</div>`;
  if (titleLines.length > 2) html += `<div class="terms-meta">${escapeHtml(titleLines.slice(2).join('   |   '))}</div>`;
  html += '</div>';

  const majorHeadingRe = /^(\d{1,2})\.\s+([A-Z0-9][A-Z0-9 ,&/'\-]+)$/;
  const subHeadingRe = /^(\d{1,2}\.\d{1,2}\s+[A-Za-z][^.]{2,68})$/;

  let sectionOpen = false;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    const majorMatch = line.match(majorHeadingRe);
    if (majorMatch) {
      if (sectionOpen) html += '</div>';
      html += '<div class="terms-section-block">';
      html += `<h3 class="terms-h1"><span class="terms-h1-num">${majorMatch[1]}</span>${escapeHtml(majorMatch[2].trim())}</h3>`;
      sectionOpen = true;
      continue;
    }

    const subMatch = line.match(subHeadingRe);
    if (subMatch) {
      html += `<h4 class="terms-h2">${escapeHtml(subMatch[1])}</h4>`;
      continue;
    }

    html += `<p class="terms-p">${escapeHtml(line)}</p>`;
  }
  if (sectionOpen) html += '</div>';
  return html;
}

async function generateReceiptPDF(paymentData) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Date formatting
  const confirmDate = new Date();
  const dateStr = confirmDate.toLocaleDateString('en-IN');
  const timeStr = confirmDate.toLocaleTimeString('en-IN');
  

  const templatePath = path.join(__dirname, '..', 'templates', 'payment_slip.html');
  let htmlContent = fs.readFileSync(templatePath, 'utf8');

  const logoPath = path.join(__dirname, '..', '..', 'public', 'clinidea Logo', 'Clinidea_Education_Logo_header.png');
  let logoBase64 = '';
  if (fs.existsSync(logoPath)) {
    logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  }

  htmlContent = htmlContent
    .replace(/{{logoBase64}}/g, logoBase64)
    .replace(/{{receiptNumber}}/g, paymentData.receiptNo || 'N/A')
    .replace(/{{paymentDate}}/g, paymentData.paymentDate || dateStr)
    .replace(/{{studentName}}/g, paymentData.studentName || 'N/A')
    .replace(/{{transactionId}}/g, paymentData.paymentId || 'N/A')
    .replace(/{{studentPhone}}/g, paymentData.mobileNo || 'N/A')
    .replace(/{{studentEmail}}/g, paymentData.email || 'N/A')
    .replace(/{{courseName}}/g, paymentData.course || 'N/A')
    .replace(/{{paymentType}}/g, paymentData.method || 'Online')
    .replace(/{{totalFees}}/g, paymentData.totalFees || 0)
    .replace(/{{amountPaid}}/g, paymentData.feesPaid || 0)
    .replace(/{{feesPending}}/g, paymentData.feesPending || 0)
    .replace(/{{paymentMethod}}/g, paymentData.paymentMode || 'N/A')
    .replace(/{{paymentTime}}/g, paymentData.paymentTime || timeStr);

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');

  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();

  const fileName = `receipt_${paymentData.receiptNo}.pdf`;
  return savePdfLocally(pdfBuffer, 'receipts', fileName);
}

async function generateRegistrationReceiptPDF(paymentData) {
  try {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Set precise exact Date/Time for visual signature
    const generationDate = new Date();
    const dateStr = generationDate.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const timeStr = generationDate.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    
    // Standardize IDs
    const safePaymentId = paymentData.transactionId || paymentData.paymentId || 'REG-' + Date.now();
    const receiptNo = paymentData.receiptNo || safePaymentId;

    const templatePath = path.join(__dirname, '..', 'templates', 'payment_slip.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    const logoPath = path.join(__dirname, '..', '..', 'public', 'clinidea Logo', 'Clinidea_Education_Logo_header.png');
    let logoBase64 = '';
    if (fs.existsSync(logoPath)) {
      logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
    }

    htmlContent = htmlContent
      .replace(/{{logoBase64}}/g, logoBase64)
      .replace(/{{receiptNumber}}/g, receiptNo)
      .replace(/{{paymentDate}}/g, dateStr)
      .replace(/{{studentName}}/g, paymentData.studentName || 'N/A')
      .replace(/{{transactionId}}/g, safePaymentId)
      .replace(/{{studentPhone}}/g, paymentData.mobileNo || paymentData.phone || 'N/A')
      .replace(/{{studentEmail}}/g, paymentData.email || 'N/A')
      .replace(/{{courseName}}/g, paymentData.courseName || paymentData.course || 'Clinical Research Program')
      .replace(/{{paymentType}}/g, paymentData.paymentType || 'Online Registration')
      .replace(/{{totalFees}}/g, paymentData.totalFees !== undefined ? paymentData.totalFees : (paymentData.amount || 0))
      .replace(/{{amountPaid}}/g, paymentData.amountPaid !== undefined ? paymentData.amountPaid : (paymentData.amount || 0))
      .replace(/{{feesPending}}/g, paymentData.remainingFees || paymentData.feesPending || 0)
      .replace(/{{paymentMethod}}/g, 'Razorpay')
      .replace(/{{paymentTime}}/g, timeStr);

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const fileName = `reg_receipt_${safePaymentId.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '30px', bottom: '30px' } });
    await browser.close();

    // Cryptographically sign the PDF if PFX exists
    const { signPdfCryptographically } = require('./signPdf');
    const pfxPath = path.join(__dirname, '..', '..', 'public', 'Signature and Fees recipt', 'TusharPatil.pfx');

    let finalBuffer = pdfBuffer;
    try {
      if (fs.existsSync(pfxPath)) {
        finalBuffer = await signPdfCryptographically(Buffer.from(pdfBuffer), pfxPath, 'PharmaTalentHub@2024');
      } else {
        console.warn("PFX file not found, skipping cryptographic signature.");
      }
    } catch (err) {
      console.error("Cryptographic signing failed:", err);
    }

    return savePdfLocally(finalBuffer, 'receipts', fileName);
  } catch (error) {
    console.error("Error generating registration receipt:", error);
    throw error;
  }
}

async function generateEnrollmentReceiptPDF(paymentData) {
  try {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Set precise exact Date/Time for visual signature
    const generationDate = new Date();
    const dateStr = generationDate.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const timeStr = generationDate.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    
    // Standardize IDs
    const safePaymentId = paymentData.transactionId || paymentData.paymentId || 'ENR-' + Date.now();
    const receiptNo = paymentData.receiptNo || safePaymentId;

    const templatePath = path.join(__dirname, '..', 'templates', 'payment_slip.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    const logoPath = path.join(__dirname, '..', '..', 'public', 'clinidea Logo', 'Clinidea_Education_Logo_header.png');
    let logoBase64 = '';
    if (fs.existsSync(logoPath)) {
      logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
    }

    htmlContent = htmlContent
      .replace(/{{logoBase64}}/g, logoBase64)
      .replace(/{{receiptNumber}}/g, receiptNo)
      .replace(/{{paymentDate}}/g, dateStr)
      .replace(/{{studentName}}/g, paymentData.studentName || 'N/A')
      .replace(/{{transactionId}}/g, safePaymentId)
      .replace(/{{studentPhone}}/g, paymentData.mobileNo || paymentData.phone || 'N/A')
      .replace(/{{studentEmail}}/g, paymentData.email || 'N/A')
      .replace(/{{courseName}}/g, paymentData.courseName || 'Clinical Research Program')
      .replace(/{{paymentType}}/g, 'Course Enrollment')
      .replace(/{{totalFees}}/g, paymentData.totalFees || 0)
      .replace(/{{amountPaid}}/g, paymentData.amountPaid || 0)
      .replace(/{{feesPending}}/g, paymentData.remainingFees || 0)
      .replace(/{{paymentMethod}}/g, 'Razorpay')
      .replace(/{{paymentTime}}/g, timeStr);

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const fileName = `enroll_receipt_${safePaymentId.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '30px', bottom: '30px' } });
    await browser.close();

    // Cryptographically sign the PDF if PFX exists
    const { signPdfCryptographically } = require('./signPdf');
    const pfxPath = path.join(__dirname, '..', '..', 'public', 'Signature and Fees recipt', 'TusharPatil.pfx');

    let finalBuffer = pdfBuffer;
    try {
      if (fs.existsSync(pfxPath)) {
        finalBuffer = await signPdfCryptographically(Buffer.from(pdfBuffer), pfxPath, 'PharmaTalentHub@2024');
      } else {
        console.warn("PFX file not found, skipping cryptographic signature.");
      }
    } catch (err) {
      console.error("Cryptographic signing failed:", err);
    }

    return savePdfLocally(finalBuffer, 'receipts', fileName);
  } catch (error) {
    console.error("Error generating enrollment receipt:", error);
    throw error;
  }
}
async function generateCertificatePDF(certData) {
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const QRCode = require('qrcode');
  
  // Map the certificateType to a PDF filename
  const templateMap = {
    'gcp': 'GCP_CERTIFICATE.pdf',
    'advanced': 'ADVANCED_CERTIFICATE.pdf',
    'internship': 'INTERNSHIP_CERTIFICATE.pdf',
    'completion': 'CERTIFICATE_OF_COMPLETION.pdf'
  };
  let pdfName = templateMap[certData.certificateType] || 'CERTIFICATE_OF_COMPLETION.pdf';
  let templatePath = path.join(__dirname, '..', '..', 'public', 'Certificates', pdfName);
  
  // Fallback to completion if the specific one doesn't exist
  if (!fs.existsSync(templatePath)) {
    templatePath = path.join(__dirname, '..', '..', 'public', 'Certificates', 'CERTIFICATE_OF_COMPLETION.pdf');
  }
  
  if (!fs.existsSync(templatePath)) {
    throw new Error("Template not found at: " + templatePath);
  }
  const existingPdfBytes = fs.readFileSync(templatePath);
  
  // Load a PDFDocument from the existing PDF bytes
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  
  const { width, height } = firstPage.getSize();
  
  // -- WHITE BOX PATCHES --
  // We draw white rectangles over the existing baked-in text placeholders to hide them.
  // This assumes the background is white.
  
  // 1. Cover "Name Of Student" and "[Course Name]" (Center)
  firstPage.drawRectangle({
    x: 100,
    y: height / 2 - 60,
    width: width - 200,
    height: 120,
    color: rgb(1, 1, 1),
  });

  // 2. Cover "[Start Date] to [End Date]" (Center/Bottom)
  firstPage.drawRectangle({
    x: 150,
    y: height / 2 - 110,
    width: width - 300,
    height: 40,
    color: rgb(1, 1, 1),
  });

  // 3. Cover "CE/XXXX/YY" (Usually bottom left or center)
  firstPage.drawRectangle({
    x: 50,
    y: 30,
    width: 250,
    height: 50,
    color: rgb(1, 1, 1),
  });

  // Embed fonts
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 1. Draw Student Name
  const nameText = certData.studentName.toUpperCase();
  const nameFontSize = 36;
  const nameTextWidth = timesRomanBoldFont.widthOfTextAtSize(nameText, nameFontSize);
  firstPage.drawText(nameText, {
    x: (width / 2) - (nameTextWidth / 2),
    y: height / 2 + 20, 
    size: nameFontSize,
    font: timesRomanBoldFont,
    color: rgb(0, 0, 0.4), // Dark Blue
  });

  // 2. Draw Course Name
  const courseText = certData.courseName;
  const courseFontSize = 18;
  const courseTextWidth = helveticaFont.widthOfTextAtSize(courseText, courseFontSize);
  firstPage.drawText(courseText, {
    x: (width / 2) - (courseTextWidth / 2),
    y: height / 2 - 20, 
    size: courseFontSize,
    font: helveticaFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  // 3. Draw Duration (Start Date to End Date)
  const durationText = `Duration: ${certData.startDate} to ${certData.endDate}`;
  const durationFontSize = 14;
  const durationTextWidth = helveticaFont.widthOfTextAtSize(durationText, durationFontSize);
  firstPage.drawText(durationText, {
    x: (width / 2) - (durationTextWidth / 2),
    y: height / 2 - 70, // adjust y as needed
    size: durationFontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  // 4. Generate & Embed QR Code
  // The QR code links to the verification page
  const verifyUrl = `https://clinidea.in/verify/${certData.certificateId}`;
  const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 150 });
  const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
  
  const qrImage = await pdfDoc.embedPng(qrImageBuffer);
  
  // Place QR Code in the bottom-left or bottom-right corner.
  // Assuming bottom-right for now.
  const qrDims = qrImage.scale(0.8);
  firstPage.drawImage(qrImage, {
    x: width - qrDims.width - 50,
    y: 50,
    width: qrDims.width,
    height: qrDims.height,
  });

  // 5. Draw Certificate ID near QR Code
  firstPage.drawText(`ID: ${certData.certificateId}`, {
    x: width - qrDims.width - 50,
    y: 35,
    size: 10,
    font: helveticaFont,
    color: rgb(0, 0, 0),
  });

  // Serialize the PDFDocument to bytes (a Uint8Array)
  const pdfBytes = await pdfDoc.save();

  const safeFileName = certData.certificateId.replace(/\//g, '-');
  const fileName = `${safeFileName}.pdf`;
  const pdfBuffer = Buffer.from(pdfBytes);

  // Try signing the PDF
  let finalBuffer = pdfBuffer;
  try {
    const { signPdfCryptographically } = require('./signPdf');
    const pfxPath = path.join(__dirname, '..', '..', 'public', 'Signature and Fees recipt', 'TusharPatil.pfx');
    if (fs.existsSync(pfxPath)) {
      finalBuffer = await signPdfCryptographically(pdfBuffer, pfxPath, 'PharmaTalentHub@2024');
    }
  } catch (signErr) {
    console.error("Certificate signing failed:", signErr);
  }

  return savePdfLocally(finalBuffer, 'certificates', fileName);
}

async function generateApplicationFormPDF(admission) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const templatePath = path.join(__dirname, '..', 'templates', 'application_form.html');
  let htmlContent = fs.readFileSync(templatePath, 'utf8');

  const imgTag = (url, alt) => url ? `<img src="${url}" alt="${alt}" />` : `<span class="no-img">Not provided</span>`;

  const logoPath = path.join(__dirname, '..', '..', 'public', 'clinidea Logo', 'Clinidea_Education_Logo_header.png');
  let logoImgTag = '';
  if (fs.existsSync(logoPath)) {
    const logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
    logoImgTag = `<img src="${logoBase64}" alt="Clinidea Education" />`;
  }

  const applicationId = admission.studentId || ('APP-' + String(admission.id || Date.now()).slice(-8).toUpperCase());

  htmlContent = htmlContent
    .replace(/{{logoImg}}/g, logoImgTag)
    .replace(/{{applicationId}}/g, applicationId)
    .replace(/{{fullName}}/g, admission.fullName || 'N/A')
    .replace(/{{dateOfBirth}}/g, admission.dateOfBirth || 'N/A')
    .replace(/{{gender}}/g, admission.gender || 'N/A')
    .replace(/{{mobileNumber}}/g, admission.mobileNumber || 'N/A')
    .replace(/{{alternateNumber}}/g, admission.alternateNumber || 'N/A')
    .replace(/{{email}}/g, admission.email || 'N/A')
    .replace(/{{address}}/g, admission.address || 'N/A')
    .replace(/{{city}}/g, admission.city || 'N/A')
    .replace(/{{state}}/g, admission.state || 'N/A')
    .replace(/{{country}}/g, admission.country || 'N/A')
    .replace(/{{pincode}}/g, admission.pincode || 'N/A')
    .replace(/{{qualification}}/g, admission.qualification || 'N/A')
    .replace(/{{institution}}/g, admission.institution || 'N/A')
    .replace(/{{yearOfPassing}}/g, admission.yearOfPassing || 'N/A')
    .replace(/{{govtIdNumber}}/g, admission.govtIdNumber || 'N/A')
    .replace(/{{panNumber}}/g, admission.panNumber || 'N/A')
    .replace(/{{course}}/g, admission.course || 'N/A')
    .replace(/{{submittedDate}}/g, new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))
    .replace('{{termsHtml}}', renderTermsHtml(TERMS_AND_CONDITIONS_TEXT))
    .replace('{{photoImg}}', imgTag(admission.documents?.photo, 'Photo'))
    .replace('{{facialImg}}', imgTag(admission.facialPhotoUrl, 'Live Facial Verification'))
    .replace('{{signatureImg}}', imgTag(admission.signatureUrl, 'Digital Signature'));

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  // The Noto Sans webfont (needed for the ₹ glyph) can still be loading after
  // networkidle0 fires — wait for it explicitly so currency amounts don't render blank.
  await page.evaluateHandle('document.fonts.ready');

  const fileName = `application_${admission.id}_${Date.now()}.pdf`;

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '18px', bottom: '46px', left: '18px', right: '18px' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%; font-size:8px; color:#94a3b8; text-align:center; font-family: Arial, sans-serif; padding-top:4px;">
        Clinidea Education &middot; Student Admission Application Form &middot; Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`
  });
  await browser.close();

  return savePdfLocally(pdfBuffer, 'application_forms', fileName);
}

module.exports = {
  generateReceiptPDF,
  generateRegistrationReceiptPDF,
  generateEnrollmentReceiptPDF,
  generateCertificatePDF,
  generateApplicationFormPDF
};

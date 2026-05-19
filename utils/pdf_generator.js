const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
  
  const receiptsDir = path.join(__dirname, '..', 'uploads', 'receipts');
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
  }

  const fileName = `receipt_${paymentData.receiptNo}.pdf`;
  const filePath = path.join(receiptsDir, fileName);
  
  await page.pdf({ path: filePath, format: 'A4', printBackground: true });
  await browser.close();
  
  return `/uploads/receipts/${fileName}`;
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
    
    const receiptsDir = path.join(__dirname, '..', 'uploads', 'receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }

    const fileName = `reg_receipt_${safePaymentId.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const filePath = path.join(receiptsDir, fileName);
    
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

    fs.writeFileSync(filePath, finalBuffer);

    return `/uploads/receipts/${fileName}`;
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
    
    const receiptsDir = path.join(__dirname, '..', 'uploads', 'receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }

    const fileName = `enroll_receipt_${safePaymentId.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const filePath = path.join(receiptsDir, fileName);
    
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

    fs.writeFileSync(filePath, finalBuffer);

    return `/uploads/receipts/${fileName}`;
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

  // Save the new PDF
  const certsDir = path.join(__dirname, '..', 'uploads', 'certificates');
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const safeFileName = certData.certificateId.replace(/\//g, '-');
  const fileName = `${safeFileName}.pdf`;
  const filePath = path.join(certsDir, fileName);

  const pdfBuffer = Buffer.from(pdfBytes);

  // Try signing the PDF
  try {
    const { signPdfCryptographically } = require('./signPdf');
    const pfxPath = path.join(__dirname, '..', '..', 'public', 'Signature and Fees recipt', 'TusharPatil.pfx');
    if (fs.existsSync(pfxPath)) {
      const signedPdfBuffer = await signPdfCryptographically(pdfBuffer, pfxPath, 'PharmaTalentHub@2024');
      fs.writeFileSync(filePath, signedPdfBuffer);
    } else {
      fs.writeFileSync(filePath, pdfBuffer);
    }
  } catch (signErr) {
    console.error("Certificate signing failed:", signErr);
    fs.writeFileSync(filePath, pdfBuffer);
  }

  return `/uploads/certificates/${fileName}`;
}

module.exports = { 
  generateReceiptPDF, 
  generateRegistrationReceiptPDF, 
  generateEnrollmentReceiptPDF,
  generateCertificatePDF
};

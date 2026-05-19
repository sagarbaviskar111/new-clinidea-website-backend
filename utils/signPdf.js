const fs = require('fs');
const signer = require('node-signpdf').default;
const { plainAddPlaceholder } = require('node-signpdf/dist/helpers');

async function signPdfCryptographically(pdfBuffer, pfxPath, passphrase) {
  try {
    const p12Buffer = fs.readFileSync(pfxPath);
    
    // Add a placeholder for the signature
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: 'Clinidea Education Fee Receipt Digital Signature',
      contactInfo: 'admin@clinidea.in',
      name: 'Tushar Patil',
      location: 'India',
    });

    // Sign the PDF
    const signedPdf = signer.sign(pdfWithPlaceholder, p12Buffer, {
      passphrase: passphrase
    });

    return signedPdf;
  } catch (error) {
    console.error("Error signing PDF:", error);
    throw error;
  }
}

module.exports = { signPdfCryptographically };

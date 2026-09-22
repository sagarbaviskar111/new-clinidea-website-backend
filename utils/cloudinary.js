const cloudinary = require('cloudinary').v2;
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary's default account security setting blocks public delivery of PDF/ZIP
// files uploaded as resource_type "image" (returns 401 on the URL) unless the
// account has explicitly enabled "Allow delivery of PDF and ZIP files". Uploading
// PDFs as resource_type "raw" instead sidesteps that restriction entirely, since
// raw files are served as-is with no image-transformation pipeline involved.
//
// The temp file's own path is not a reliable signal — multer's `dest` shorthand
// (used for every upload-then-forward-to-Cloudinary endpoint) names temp files
// with no extension at all — so callers that know the real file (its original
// name and/or mimetype, e.g. from `req.file`) should pass `originalName` so this
// can detect a PDF correctly; a bare temp path with a real `.pdf` extension (as
// pdf_generator.js writes) is still detected without needing that hint.
const isPdf = (filePath, originalName) => {
  const candidate = originalName || filePath;
  return path.extname(candidate).toLowerCase() === '.pdf';
};

/**
 * Uploads a file to Cloudinary
 * @param {string} filePath Path to local file
 * @param {string} folder Optional folder path in Cloudinary
 * @param {string} [originalName] The file's real name/extension, when filePath is an extensionless temp file (e.g. from multer's `dest` storage)
 * @returns {Promise<Object>} Object containing url and public_id
 */
async function uploadToCloudinary(filePath, folder = 'lms_materials', originalName) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: isPdf(filePath, originalName) ? 'raw' : 'auto'
    }, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve({
        url: result.secure_url,
        public_id: result.public_id
      });
    });
  });
}

/**
 * Uploads a large file (e.g. LMS/mentor video content) to Cloudinary using
 * chunked upload, which standard upload() can time out or fail on for
 * anything beyond roughly 100MB.
 * @param {string} filePath Path to local file
 * @param {string} folder Optional folder path in Cloudinary
 * @param {string} [originalName] The file's real name/extension, when filePath is an extensionless temp file
 * @returns {Promise<Object>} Object containing url and public_id
 */
async function uploadLargeToCloudinary(filePath, folder = 'lms_materials', originalName) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, {
      folder: folder,
      resource_type: isPdf(filePath, originalName) ? 'raw' : 'auto',
      chunk_size: 6 * 1024 * 1024
    }, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve({
        url: result.secure_url,
        public_id: result.public_id
      });
    });
  });
}

module.exports = {
  uploadToCloudinary,
  uploadLargeToCloudinary,
  isCloudinaryConfigured: () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
};

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a file to Cloudinary
 * @param {string} filePath Path to local file
 * @param {string} folder Optional folder path in Cloudinary
 * @returns {Promise<Object>} Object containing url and public_id
 */
async function uploadToCloudinary(filePath, folder = 'lms_materials') {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'auto'
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
  isCloudinaryConfigured: () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
};

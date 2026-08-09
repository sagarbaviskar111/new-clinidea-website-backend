const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require('fs');

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'clinidea-lms';

// Only initialize if we have credentials
let r2Client = null;

function getClient() {
  if (r2Client) return r2Client;
  
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error('Cloudflare R2 credentials are not fully configured in .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return r2Client;
}

/**
 * Uploads a file to Cloudflare R2
 * @param {string} filePath - Local path of the file to upload
 * @param {string} objectKey - Key (path/name) to save as in R2
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} The uploaded object key
 */
async function uploadToR2(filePath, objectKey, mimeType) {
  const client = getClient();
  const fileStream = fs.createReadStream(filePath);
  
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: objectKey,
    Body: fileStream,
    ContentType: mimeType,
  };

  await client.send(new PutObjectCommand(uploadParams));
  return objectKey;
}

/**
 * Deletes a file from Cloudflare R2
 * @param {string} objectKey 
 */
async function deleteFromR2(objectKey) {
  const client = getClient();
  const deleteParams = {
    Bucket: BUCKET_NAME,
    Key: objectKey,
  };

  await client.send(new DeleteObjectCommand(deleteParams));
  return true;
}

/**
 * Gets a presigned URL to view/download a file (expires in 12 hours)
 * @param {string} objectKey 
 * @returns {Promise<string>}
 */
async function getPresignedUrl(objectKey) {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey,
  });
  
  // URL expires in 12 hours
  const url = await getSignedUrl(client, command, { expiresIn: 12 * 60 * 60 });
  return url;
}

/**
 * Get readable stream for a file from R2 (useful for ZIP creation)
 * @param {string} objectKey 
 */
async function getFileStreamFromR2(objectKey) {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey,
  });
  
  const response = await client.send(command);
  return response.Body; // ReadableStream
}

module.exports = {
  uploadToR2,
  deleteFromR2,
  getPresignedUrl,
  getFileStreamFromR2
};

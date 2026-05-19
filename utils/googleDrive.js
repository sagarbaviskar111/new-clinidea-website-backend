const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const stream = require('stream');

const keyFilePath = path.join(__dirname, '..', 'service-account.json');

let driveClient = null;

try {
  // Use OAuth2 if environment variables are provided
  if (process.env.DRIVE_CLIENT_ID && process.env.DRIVE_CLIENT_SECRET && process.env.DRIVE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.DRIVE_CLIENT_ID,
      process.env.DRIVE_CLIENT_SECRET,
      process.env.DRIVE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
    );
    
    oauth2Client.setCredentials({ refresh_token: process.env.DRIVE_REFRESH_TOKEN });
    driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    console.log("Google Drive API initialized successfully via OAuth2.");
  } 
  // Fallback to service account if it exists (mostly for backward compatibility, but won't work for standard accounts)
  else if (fs.existsSync(keyFilePath)) {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = google.drive({ version: 'v3', auth });
    console.log("Google Drive API initialized successfully via service-account.json.");
  } else {
    console.warn("WARNING: Missing Drive credentials! Set DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, and DRIVE_REFRESH_TOKEN in .env");
  }
} catch (error) {
  console.error("Error initializing Google Drive API:", error);
}

/**
 * Creates a folder in Google Drive
 * @param {string} folderName Name of the folder
 * @param {string} parentId ID of the parent folder (Base folder)
 * @returns {Promise<string>} The ID of the created folder
 */
async function createDriveFolder(folderName, parentId) {
  if (!driveClient) throw new Error("Google Drive API not initialized (Missing service-account.json)");
  
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : []
  };

  try {
    const file = await driveClient.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    
    // Optional: Make the folder accessible to anyone with the link
    try {
      await driveClient.permissions.create({
        fileId: file.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });
    } catch(permErr) {
      console.log("Could not set folder permissions, ignoring...", permErr.message);
    }

    return file.data.id;
  } catch (err) {
    console.error("Error creating Drive folder with parent:", parentId, "-", err.message);
    // Fallback: If parent folder is not found or no permission, create in root drive
    if (parentId) {
      console.log("Fallback: Attempting to create folder in root directory instead.");
      return await createDriveFolder(folderName, null);
    }
    throw err;
  }
}

/**
 * Uploads a file to Google Drive and sets secure permissions
 * @param {Buffer} fileBuffer The file buffer
 * @param {string} fileName The name of the file
 * @param {string} mimeType The MIME type
 * @param {string} parentId The ID of the parent folder
 * @returns {Promise<Object>} Object containing fileId and webViewLink
 */
async function uploadToDrive(fileBuffer, fileName, mimeType, parentId) {
  if (!driveClient) throw new Error("Google Drive API not initialized (Missing service-account.json)");

  const bufferStream = new stream.PassThrough();
  bufferStream.end(fileBuffer);

  const fileMetadata = {
    name: fileName,
    parents: parentId ? [parentId] : []
  };
  
  // Disable copying/downloading/printing for PDF and Video files
  if (mimeType.includes('pdf') || mimeType.includes('video')) {
    fileMetadata.copyRequiresWriterPermission = true;
  }

  const media = {
    mimeType: mimeType,
    body: bufferStream,
  };

  try {
    // 1. Upload the file
    const file = await driveClient.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });
    
    const fileId = file.data.id;

    // 2. Set permissions to "Anyone with the link can view"
    await driveClient.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      }
    });

    return {
      fileId: fileId,
      webViewLink: file.data.webViewLink
    };
  } catch (err) {
    console.error("Error uploading to Drive:", err);
    throw err;
  }
}

/**
 * Uploads a file from the filesystem to Google Drive and sets secure permissions
 * @param {string} filePath Path to the file
 * @param {string} fileName The name of the file
 * @param {string} mimeType The MIME type
 * @param {string} parentId The ID of the parent folder
 * @returns {Promise<Object>} Object containing fileId and webViewLink
 */
async function uploadFileToDrive(filePath, fileName, mimeType, parentId) {
  if (!driveClient) throw new Error("Google Drive API not initialized (Missing service-account.json)");

  const fileMetadata = {
    name: fileName,
    parents: parentId ? [parentId] : []
  };
  
  if (mimeType.includes('pdf') || mimeType.includes('video')) {
    fileMetadata.copyRequiresWriterPermission = true;
  }

  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filePath),
  };

  try {
    const file = await driveClient.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });
    
    const fileId = file.data.id;

    await driveClient.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      }
    });

    return {
      fileId: fileId,
      webViewLink: file.data.webViewLink
    };
  } catch (err) {
    console.error("Error uploading file to Drive:", err);
    throw err;
  }
}

/**
 * Deletes a file from Google Drive
 * @param {string} fileId The ID of the file to delete
 */
async function deleteDriveFile(fileId) {
  if (!driveClient) throw new Error("Google Drive API not initialized");
  try {
    await driveClient.files.delete({ fileId: fileId });
    return true;
  } catch (err) {
    console.error("Error deleting file from Drive:", err);
    throw err;
  }
}

/**
 * Finds a folder by name inside a parent folder
 * @param {string} folderName Name of the folder
 * @param {string} parentId ID of the parent folder
 * @returns {Promise<string|null>} The ID of the folder or null
 */
async function findDriveFolder(folderName, parentId) {
  if (!driveClient) throw new Error("Google Drive API not initialized");
  try {
    const res = await driveClient.files.list({
      q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });
    if (res.data.files.length > 0) {
      return res.data.files[0].id;
    }
    return null;
  } catch (err) {
    console.error("Error finding Drive folder:", err);
    throw err;
  }
}

module.exports = {
  createDriveFolder,
  uploadToDrive,
  uploadFileToDrive,
  deleteDriveFile,
  findDriveFolder
};

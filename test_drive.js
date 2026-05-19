require('dotenv').config();
const { createDriveFolder } = require('./utils/googleDrive');

async function test() {
  try {
    console.log("Testing drive folder creation...");
    const id = await createDriveFolder('Test Folder', process.env.BASE_DRIVE_FOLDER_ID);
    console.log("Success! ID:", id);
  } catch (err) {
    console.error("Failed:", err.message);
  }
}
test();

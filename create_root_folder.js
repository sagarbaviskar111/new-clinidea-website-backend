const { createDriveFolder } = require('./utils/googleDrive');
async function run() {
  try {
    const id = await createDriveFolder('Clinidea_LMS_Base_Folder', null);
    console.log("Created folder with ID:", id);
  } catch (err) {
    console.error("Error creating folder:", err.message);
  }
}
run();

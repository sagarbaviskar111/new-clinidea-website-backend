const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

const CLIENT_ID = process.env.DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.DRIVE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('<h1>No code provided.</h1>');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    if (envContent.includes('DRIVE_REFRESH_TOKEN=')) {
      envContent = envContent.replace(/DRIVE_REFRESH_TOKEN=.*/g, `DRIVE_REFRESH_TOKEN="${tokens.refresh_token}"`);
    } else {
      envContent += `\nDRIVE_REFRESH_TOKEN="${tokens.refresh_token}"\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    
    res.send(`
      <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
        <h1 style="color: green;">Success! 🎉</h1>
        <p>Your Google Drive Refresh Token has been automatically saved to your .env file.</p>
        <p><strong>You can close this tab now and go back to the chat.</strong></p>
      </div>
    `);
    
    console.log("REFRESH TOKEN SAVED SUCCESSFULLY!");
    
    // Graceful shutdown
    setTimeout(() => {
        process.exit(0);
    }, 1000);

  } catch (err) {
    console.error(err);
    res.status(500).send('<h1>Error getting tokens</h1><p>' + err.message + '</p>');
  }
});

app.listen(PORT, () => {
  console.log(`Auto Token Server listening on http://localhost:${PORT}`);
});

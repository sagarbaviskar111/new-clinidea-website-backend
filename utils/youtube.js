const { google } = require('googleapis');
const fs = require('fs');

let youtubeClient = null;

try {
  const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.DRIVE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN || process.env.DRIVE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      process.env.YOUTUBE_REDIRECT_URI || process.env.DRIVE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
    );
    
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    youtubeClient = google.youtube({ version: 'v3', auth: oauth2Client });
    console.log("YouTube API initialized successfully using YouTube credentials.");
  } else {
    console.warn("WARNING: YouTube integration requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in .env");
  }
} catch (error) {
  console.error("Error initializing YouTube API:", error);
}

/**
 * Uploads a video to YouTube as unlisted/private
 * @param {string} filePath Path to the video file
 * @param {string} title Video Title
 * @param {string} description Video Description
 * @returns {Promise<Object>} Object containing videoId and videoUrl
 */
async function uploadToYouTube(filePath, title, description) {
  if (!youtubeClient) {
    throw new Error("YouTube API not initialized (missing environment variables)");
  }
  
  try {
    const response = await youtubeClient.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: title || 'Live Class Session',
          description: description || 'Clinidea Lecture Session Video',
          categoryId: '27', // Education category
          defaultLanguage: 'en',
          defaultAudioLanguage: 'en'
        },
        status: {
          privacyStatus: 'unlisted', // 'unlisted' means only people with link can view it (perfect for students!)
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(filePath)
      }
    });
    
    const videoId = response.data.id;
    const videoUrl = `https://www.youtube.com/embed/${videoId}`;
    return { videoId, videoUrl };
  } catch (error) {
    console.error("Error uploading to YouTube:", error);
    throw error;
  }
}

module.exports = {
  uploadToYouTube,
  isYouTubeAvailable: () => !!youtubeClient
};

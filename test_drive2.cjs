const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  const script = `
    cat << 'EOF' > /tmp/test-drive.js
    require('dotenv').config({ path: '/var/www/clinidea/backend/.env' });
    const { google } = require('googleapis');
    const path = require('path');
    const keyFilePath = '/var/www/clinidea/backend/service-account.json';
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const driveClient = google.drive({ version: 'v3', auth });
    async function test() {
      try {
        const res = await driveClient.files.list({ pageSize: 1, fields: 'files(id, name)' });
        console.log('Success! Found files:', res.data.files);
      } catch (err) {
        console.error('Error:', err.message);
      }
    }
    test();
EOF
    cd /var/www/clinidea/backend && node /tmp/test-drive.js
  `;
  
  conn.exec(script, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end());
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
  });
}).connect({
  host: '185.199.53.21', port: 22, username: 'root', password: 'Swami@28031999'
});

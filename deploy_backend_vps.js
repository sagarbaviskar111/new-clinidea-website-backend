require('dotenv').config();
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('cd /var/www/clinidea && git reset --hard && git clean -fd && git pull origin main && cd backend && npm install && pm2 restart clinidea-backend', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Command complete with code: ' + code);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: process.env.VPS_HOST,
  port: 22,
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD
});

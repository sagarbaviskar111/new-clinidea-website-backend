require('dotenv').config();
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('pm2 logs clinidea-backend --lines 150 --nostream', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
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

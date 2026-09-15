require('dotenv').config();
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('cd /var/www/clinidea && ls -la && pm2 list', (err, stream) => {
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

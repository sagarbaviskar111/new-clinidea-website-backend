const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const localFile = path.join(__dirname, 'utils', 'googleDrive.js');
const remoteFile = '/var/www/clinidea/backend/utils/googleDrive.js';

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    console.log('SFTP :: ready');
    
    sftp.fastPut(localFile, remoteFile, (err) => {
      if (err) throw err;
      console.log('Upload complete!');
      
      console.log('Restarting backend...');
      conn.exec('pm2 restart clinidea-backend', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
          console.log('Restart complete with code: ' + code);
          conn.end();
        }).on('data', (data) => {
          console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
          console.log('STDERR: ' + data);
        });
      });
    });
  });
}).connect({
  host: '185.199.53.21',
  port: 22,
  username: 'root',
  password: 'Swami@28031999'
});

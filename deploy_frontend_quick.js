const { execSync } = require('child_process');
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

console.log("Building frontend...");
execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

console.log("Zipping build...");
execSync('tar -czf build.tar.gz dist', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    console.log('SFTP :: ready. Uploading...');
    
    sftp.fastPut(path.join(__dirname, '..', 'build.tar.gz'), '/var/www/clinidea/build.tar.gz', (err) => {
      if (err) throw err;
      console.log('Upload complete!');
      
      console.log('Extracting on server...');
      conn.exec('cd /var/www/clinidea && rm -rf dist_backup && mv dist dist_backup && mkdir dist && tar -xzf build.tar.gz -C dist/ && rm build.tar.gz && mv dist/dist/* dist/ && rm -rf dist/dist', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
          console.log('Extraction complete with code: ' + code);
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

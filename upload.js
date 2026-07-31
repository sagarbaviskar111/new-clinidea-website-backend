const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();

conn.on('ready', () => {
  console.log('Connected via SSH');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const readStream = fs.createReadStream('../Clinidea_Frontend_Update.zip');
    const writeStream = sftp.createWriteStream('/var/www/clinidea/Clinidea_Frontend_Update.zip');

    writeStream.on('close', () => {
      console.log('File transferred successfully.');
      conn.exec('cd /var/www/clinidea && unzip -o Clinidea_Frontend_Update.zip -d dist_temp && rm -rf dist && mv dist_temp dist && rm Clinidea_Frontend_Update.zip', (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d));
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', () => {
          console.log('Deployment successful.');
          conn.end();
        });
      });
    });

    readStream.pipe(writeStream);
  });
}).connect({
  host: '185.199.53.21',
  username: 'root',
  password: 'Swami@28031999'
});

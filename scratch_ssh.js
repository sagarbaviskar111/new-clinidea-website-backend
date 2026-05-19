const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to server...');

conn.on('ready', () => {
  console.log('SSH connection ready!');
  
  conn.exec('tail -n 100 /root/.pm2/logs/clinidea-backend-error.log', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.end();
    });
    stream.on('data', (data) => process.stdout.write(data));
    stream.stderr.on('data', (data) => process.stderr.write(data));
  });
}).connect({
  host: '185.199.53.21',
  port: 22,
  username: 'root',
  password: 'Swami@28031999',
  readyTimeout: 30000
});

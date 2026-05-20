const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to server...');

conn.on('ready', () => {
  console.log('SSH connection ready!');
  
  const setupScript = `
    cat /etc/nginx/sites-enabled/clinidea.in || cat /etc/nginx/sites-available/clinidea.in || cat /etc/nginx/sites-available/default || cat /etc/nginx/nginx.conf
  `;
  
  conn.exec(setupScript, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      console.log('Command process exited with code ' + code);
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

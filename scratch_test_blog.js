const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to server...');

conn.on('ready', () => {
  console.log('SSH connection ready!');
  
  const setupScript = `
    node -e "
    const http = require('http');
    const tokenData = JSON.stringify({ email: 'admin@clinidea.in', id: 1, role: 'admin' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ email: 'admin@clinidea.in', id: 1, role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });

    const postData = JSON.stringify({
      title: 'Test Blog',
      content: 'This is a test blog',
      metaTitle: '',
      metaDescription: '',
      featuredImage: '',
      isPublished: false
    });

    const req = http.request({
      hostname: 'localhost',
      port: 5001,
      path: '/api/admin/blogs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => console.log('Response:', res.statusCode, data));
    });

    req.on('error', (e) => console.error(e));
    req.write(postData);
    req.end();
    "
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

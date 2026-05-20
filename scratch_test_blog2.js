const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to server...');

conn.on('ready', () => {
  console.log('SSH connection ready!');
  
  const setupScript = `
    cat << 'EOF' > /tmp/test-blog.js
    const http = require('http');

    const postData = JSON.stringify({
      title: 'Test Blog',
      content: 'This is a test blog',
      metaTitle: '',
      metaDescription: '',
      featuredImage: '',
      isPublished: false
    });

    // We don't have a valid admin token, so let's hit it without one and see if it's 401
    // Actually, let's hit the server and print exactly what it returns
    const req = http.request({
      hostname: 'localhost',
      port: 5001,
      path: '/api/admin/blogs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
EOF
    node /tmp/test-blog.js
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

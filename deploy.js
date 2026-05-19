const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to Clinidea Production VPS...');

conn.on('ready', () => {
  console.log('SSH connection established successfully!');
  
  const deployScript = `
    echo "=== Navigating to Clinidea directory ==="
    cd /var/www/clinidea
    
    echo "=== Fetching and merging latest code from Git ==="
    git reset --hard HEAD
    git pull origin main
    
    echo "=== Installing dependencies ==="
    npm install
    
    echo "=== Building Production Client Bundle ==="
    npm run build
    
    echo "=== Restarting Node processes via PM2 ==="
    pm2 restart all
    
    echo "=== Deployment Completed Successfully! ==="
  `;
  
  conn.exec(deployScript, (err, stream) => {
    if (err) {
      console.error('Error executing deploy script:', err);
      conn.end();
      return;
    }
    stream.on('close', (code) => {
      console.log(`\nDeployment process exited with code ${code}`);
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
  readyTimeout: 60000
});

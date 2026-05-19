require('dotenv').config();
const jwt = require('jsonwebtoken');

async function testApi() {
  const token = jwt.sign({ userId: 15 }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
  
  const res = await fetch('http://localhost:5000/api/student/content', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await res.json();
  console.log("API Response:");
  console.log(JSON.stringify(data, null, 2));
}

testApi();

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';
const token = jwt.sign({ adminId: 1, role: 'superadmin' }, JWT_SECRET, { expiresIn: '1d' });

fetch('http://localhost:5000/api/admin/events/1', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    title: 'Test Event Update',
    description: 'Testing',
    eventType: 'quiz',
    eventDate: '2026-05-20',
    eventTime: '10:00',
    durationMinutes: "30"
  })
})
.then(res => res.json().then(data => ({status: res.status, body: data})))
.then(console.log)
.catch(console.error);

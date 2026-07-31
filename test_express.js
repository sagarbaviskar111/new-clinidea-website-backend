const express = require('express');
const app = express();

app.use((req, res, next) => {
  if (!req.url.startsWith('/api')) {
    req.url = '/api' + req.url;
  }
  next();
});

const authenticateAdmin = (req, res, next) => {
  console.log("In middleware:", { originalUrl: req.originalUrl, url: req.url, baseUrl: req.baseUrl });
  next();
};

app.get('/api/admin/dashboard', authenticateAdmin, (req, res) => {
  res.send('ok');
});

const request = require('supertest');
request(app).get('/admin/dashboard').end((err, res) => {
  console.log(res.status);
});

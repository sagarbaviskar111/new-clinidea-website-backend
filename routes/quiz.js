const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-clinidea-key';

// Middleware for Admin
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!['superadmin', 'counselor', 'mentor', 'lead_manager'].includes(decoded.role)) throw new Error();
    req.adminId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// -------------------------
// ADMIN ROUTES
// -------------------------

router.get('/admin/events/:eventId/questions', authenticateAdmin, async (req, res) => {
  try {
    const questions = await prisma.quizQuestion.findMany({
      where: { eventId: parseInt(req.params.eventId) }
    });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

router.post('/admin/events/:eventId/questions', authenticateAdmin, async (req, res) => {
  try {
    const { questionText, optionsJson, correctOption, marks } = req.body;
    const question = await prisma.quizQuestion.create({
      data: {
        eventId: parseInt(req.params.eventId),
        questionText,
        optionsJson: JSON.stringify(optionsJson),
        correctOption,
        marks: parseInt(marks) || 1
      }
    });
    res.status(201).json(question);
  } catch (err) {
    console.error("Error inserting question:", err);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

router.delete('/admin/questions/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.quizQuestion.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

router.get('/admin/events/:eventId/attempts', authenticateAdmin, async (req, res) => {
  try {
    const attempts = await prisma.quizAttempt.findMany({
      where: { eventId: parseInt(req.params.eventId) },
      orderBy: { startTime: 'desc' }
    });
    res.json(attempts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attempts' });
  }
});

// -------------------------
// PUBLIC ROUTES
// -------------------------

router.post('/public/events/:eventId/start-quiz', async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const { name, email, phone, qualification, location, courseInterest } = req.body;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { questions: true }
    });

    if (!event || event.eventType !== 'quiz') {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const existing = await prisma.quizAttempt.findFirst({
      where: {
        eventId,
        OR: [{ email }, { phone }]
      }
    });

    if (existing) {
      if (existing.status === 'submitted') {
         return res.status(400).json({ error: 'You have already completed this quiz. Multiple attempts are not allowed.' });
      }
      return res.json({ attemptId: existing.id, status: existing.status });
    }

    const attempt = await prisma.quizAttempt.create({
      data: {
        eventId,
        name,
        email,
        phone,
        qualification,
        location,
        courseInterest,
        status: 'in_progress',
        lastPausedAt: null
      }
    });

    res.json({ attemptId: attempt.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start quiz' });
  }
});

router.get('/public/events/:eventId/quiz-session/:attemptId', async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const attemptId = parseInt(req.params.attemptId);

    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.eventId !== eventId) return res.status(404).json({ error: 'Attempt not found' });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { questions: { select: { id: true, questionText: true, optionsJson: true, marks: true } } } 
    });

    if (attempt.status === 'in_progress' && attempt.lastPausedAt) {
      const pausedAt = new Date(attempt.lastPausedAt);
      const now = new Date();
      const diffMins = (now - pausedAt) / 1000 / 60;
      if (diffMins > 5) {
        await prisma.quizAttempt.update({
          where: { id: attemptId },
          data: { status: 'submitted', endTime: new Date(), score: 0 }
        });
        return res.json({ status: 'submitted', error: 'Quiz auto-submitted due to inactivity (over 5 mins).' });
      }
    }

    res.json({
      attempt,
      durationMinutes: event.durationMinutes || 30,
      questions: event.questions 
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

router.post('/public/events/:eventId/quiz-session/:attemptId/pause', async (req, res) => {
  try {
    const { responsesJson } = req.body;
    await prisma.quizAttempt.update({
      where: { id: parseInt(req.params.attemptId) },
      data: {
        lastPausedAt: new Date(),
        ...(responsesJson && { responsesJson: JSON.stringify(responsesJson) })
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pause' });
  }
});

router.post('/public/events/:eventId/quiz-session/:attemptId/submit', async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const attemptId = parseInt(req.params.attemptId);
    const { responses } = req.body; // Object: { questionId: selectedOption }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { questions: true }
    });

    let score = 0;
    let totalMarks = 0;
    
    event.questions.forEach(q => {
      totalMarks += q.marks;
      const selected = responses[q.id];
      if (selected && selected === q.correctOption) {
        score += q.marks;
      }
    });

    const attempt = await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'submitted',
        endTime: new Date(),
        score,
        responsesJson: JSON.stringify(responses)
      }
    });

    // Send Email via Centralized Service
    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const emailService = require('../utils/emailService');
        await emailService.sendQuizResult(attempt, score, totalMarks, event.title);
      }
    } catch (e) {
      console.error("Failed to send quiz notifications", e);
    }

    res.json({ success: true, score, totalMarks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

module.exports = router;

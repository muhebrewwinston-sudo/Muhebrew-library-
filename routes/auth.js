const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { sign, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { name, email, password, school, level, role } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'An account with that email already exists.' });
  }
  const cleanRole = role === 'teacher' ? 'teacher' : 'student';
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, school, level) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    String(name).trim(),
    cleanEmail,
    hash,
    cleanRole,
    school ? String(school).trim() : null,
    level ? String(level).trim() : null
  );

  const user = db.prepare('SELECT id, name, email, role, school, level, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = sign(user);
  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: 'Incorrect email or password.' });
  }
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    school: user.school,
    level: user.level,
    created_at: user.created_at
  };
  const token = sign(safeUser);
  res.json({ token, user: safeUser });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, school, level, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

router.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (next.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), user.id);
  res.json({ ok: true });
});

module.exports = router;

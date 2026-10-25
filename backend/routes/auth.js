const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { sign, requireAuth } = require('../middleware/auth');
const { calculateQuota } = require('../db/quota');
const { sendVerificationCode, sendPasswordResetCode } = require('../utils/email');

const router = express.Router();

function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Register: Anyone can register as a student. Only admin can assign teachers.
// Verification code is generated and sent to email to ensure validity.
router.post('/register', async (req, res) => {
  const { name, email, password, school, level } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const existing = db.prepare('SELECT id, is_verified FROM users WHERE email = ?').get(cleanEmail);
  const isAdminEmail = cleanEmail === 'muhebrewwinston@gmail.com';

  if (existing) {
    if (isAdminEmail) {
      // Owner account: update password and grant immediate admin access
      const hash = bcrypt.hashSync(password, 10);
      db.prepare("UPDATE users SET password_hash = ?, role = 'admin', is_verified = 1 WHERE id = ?").run(hash, existing.id);
      const user = db.prepare('SELECT id, name, email, role, school, level, created_at FROM users WHERE id = ?').get(existing.id);
      const token = sign(user);
      return res.status(200).json({ token, user, message: 'Welcome Owner!' });
    }

    if (existing.is_verified === 0) {
      // Re-send verification code for unverified existing record
      const code = generate6DigitCode();
      db.prepare("UPDATE users SET verify_code = ?, verify_expires = datetime('now', '+15 minutes') WHERE id = ?")
        .run(code, existing.id);
      sendVerificationCode(cleanEmail, name, code).catch(() => {});
      return res.status(200).json({
        requireVerification: true,
        email: cleanEmail,
        message: 'A verification code was previously sent. A new code has been sent to your email.'
      });
    }
    return res.status(400).json({ error: 'An account with that email already exists. Please sign in.' });
  }

  // Admin email exception: muhebrewwinston@gmail.com is always admin and pre-verified
  const role = isAdminEmail ? 'admin' : 'student';
  const isVerified = isAdminEmail ? 1 : 0;
  const verifyCode = isAdminEmail ? null : generate6DigitCode();
  const hash = bcrypt.hashSync(password, 10);

  const info = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, school, level, is_verified, verify_code, verify_expires) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+15 minutes'))`
  ).run(
    String(name).trim(),
    cleanEmail,
    hash,
    role,
    school ? String(school).trim() : null,
    level ? String(level).trim() : null,
    isVerified,
    verifyCode
  );

  const user = db.prepare('SELECT id, name, email, role, school, level, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);

  if (isAdminEmail) {
    const token = sign(user);
    return res.status(201).json({ token, user, message: 'Welcome Admin!' });
  }

  // Send email verification code
  sendVerificationCode(cleanEmail, user.name, verifyCode).catch((err) => {
    console.error('[Auth] Failed to send verification email:', err.message);
  });

  res.status(201).json({
    requireVerification: true,
    email: cleanEmail,
    message: 'Verification code sent to your email. Please verify to activate your account.'
  });
});

// Verify email with 6-digit code
router.post('/verify-email', (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanCode = String(code).trim();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user) {
    return res.status(404).json({ error: 'Account not found with that email.' });
  }

  if (user.is_verified === 1) {
    const token = sign(user);
    return res.json({ token, user, message: 'Account is already verified.' });
  }

  if (!user.verify_code || user.verify_code !== cleanCode) {
    return res.status(400).json({ error: 'Invalid verification code. Please check your email.' });
  }

  // Check expiration (within 15 minutes)
  const isExpired = db.prepare("SELECT 1 FROM users WHERE id = ? AND verify_expires < datetime('now')").get(user.id);
  if (isExpired) {
    return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
  }

  // Mark user as verified
  db.prepare('UPDATE users SET is_verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?').run(user.id);

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
  res.json({ token, user: safeUser, message: 'Email verified successfully! Welcome to Muhebrew Library.' });
});

// Resend verification code
router.post('/resend-code', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const cleanEmail = String(email).trim().toLowerCase();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (user.is_verified === 1) return res.status(400).json({ error: 'Account is already verified.' });

  const code = generate6DigitCode();
  db.prepare("UPDATE users SET verify_code = ?, verify_expires = datetime('now', '+15 minutes') WHERE id = ?")
    .run(code, user.id);

  sendVerificationCode(cleanEmail, user.name, code).catch(() => {});

  res.json({ success: true, message: 'A new 6-digit verification code has been sent to your email.' });
});

// Login: checks password and ensures account is verified
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

  // Check email verification (except for admin)
  if (user.role !== 'admin' && user.is_verified === 0) {
    // Send a fresh verification code
    const code = generate6DigitCode();
    db.prepare("UPDATE users SET verify_code = ?, verify_expires = datetime('now', '+15 minutes') WHERE id = ?")
      .run(code, user.id);
    sendVerificationCode(cleanEmail, user.name, code).catch(() => {});

    return res.status(403).json({
      error: 'Please verify your email address to sign in. A new verification code has been sent to your email.',
      requireVerification: true,
      email: cleanEmail
    });
  }

  if (cleanEmail === 'muhebrewwinston@gmail.com') {
    if (user.role !== 'admin' || user.is_verified !== 1) {
      db.prepare("UPDATE users SET role = 'admin', is_verified = 1 WHERE id = ?").run(user.id);
      user.role = 'admin';
      user.is_verified = 1;
    }
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

// Forgot Password: Send 6-digit reset code
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email address is required.' });
  const cleanEmail = String(email).trim().toLowerCase();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user) {
    // For security, give generic confirmation
    return res.json({ success: true, message: 'If an account exists with that email, a 6-digit reset code has been sent.' });
  }

  const code = generate6DigitCode();
  db.prepare("UPDATE users SET reset_code = ?, reset_expires = datetime('now', '+15 minutes') WHERE id = ?")
    .run(code, user.id);

  sendPasswordResetCode(cleanEmail, user.name, code).catch((err) => {
    console.error('[Auth] Failed to send password reset email:', err.message);
  });

  res.json({ success: true, message: 'A 6-digit password reset code has been sent to your email.' });
});

// Reset Password with code
router.post('/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, reset code and new password are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanCode = String(code).trim();

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  if (!user.reset_code || user.reset_code !== cleanCode) {
    return res.status(400).json({ error: 'Invalid reset code. Please check your email.' });
  }

  const isExpired = db.prepare("SELECT 1 FROM users WHERE id = ? AND reset_expires < datetime('now')").get(user.id);
  if (isExpired) {
    return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?')
    .run(newHash, user.id);

  res.json({ success: true, message: 'Password reset successfully! You can now sign in with your new password.' });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, school, level, bonus_downloads, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const quota = calculateQuota(user.id, user.role);
  res.json({ user, quota });
});

router.get('/quota', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ quota: calculateQuota(user.id, user.role) });
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

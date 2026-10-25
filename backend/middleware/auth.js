const jwt = require('jsonwebtoken');
const db = require('../db/database');

const SECRET = process.env.JWT_SECRET || 'muhebrew-fallback-jwt-secret-key-change-me';
const EXPIRES = process.env.JWT_EXPIRES || '30d';

const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name, email: u.email }, SECRET, { expiresIn: EXPIRES });

// Token comes from the Authorization header, or ?t= (used by PDF preview links)
function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : ((req.query && req.query.t) || null);
}

function optionalAuth(req, _res, next) {
  const t = readToken(req);
  if (t) { try { req.user = jwt.verify(t, SECRET); } catch { /* ignore bad token */ } }
  next();
}

function requireAuth(req, res, next) {
  const t = readToken(req);
  if (!t) return res.status(401).json({ error: 'Sign in required.' });
  try {
    req.user = jwt.verify(t, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// Role checking with automatic Owner / Admin elevation
function requireRole(...roles) {
  const allowed = roles.map((r) => String(r || '').toLowerCase().trim());
  return (req, res, next) => requireAuth(req, res, () => {
    const u = db.prepare('SELECT id, role, email FROM users WHERE id = ?').get(req.user.id);
    if (!u) return res.status(401).json({ error: 'Account not found. Please sign in again.' });

    const role = String(u.role || 'student').toLowerCase().trim();
    const email = String(u.email || '').toLowerCase().trim();
    const isOwner = email === 'muhebrewwinston@gmail.com' || email.startsWith('admin@');

    // Owner / Admin is always authorized for any role-gated endpoint
    if (isOwner || role === 'admin') {
      req.user.role = 'admin';
      req.user.email = u.email;
      req.user.id = u.id;
      return next();
    }

    if (!allowed.includes(role)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    req.user.role = role;
    req.user.email = u.email;
    req.user.id = u.id;
    next();
  });
}

const requireAdmin = requireRole('admin');

// requireUploader: ANY signed-in user (student, teacher, admin, owner) can upload!
// Students upload to unlock download quota (+5 downloads).
// Admin/Owner uploads are immediately approved & synced to Drime.
function requireUploader(req, res, next) {
  requireAuth(req, res, () => {
    const u = db.prepare('SELECT id, role, email FROM users WHERE id = ?').get(req.user.id);
    if (!u) return res.status(401).json({ error: 'Account not found. Please sign in again.' });

    const role = String(u.role || 'student').toLowerCase().trim();
    const email = String(u.email || '').toLowerCase().trim();
    const isOwner = email === 'muhebrewwinston@gmail.com' || email.startsWith('admin@');

    if (isOwner || role === 'admin') {
      req.user.role = 'admin';
    } else if (role === 'teacher') {
      req.user.role = 'teacher';
    } else {
      req.user.role = 'student';
    }
    req.user.id = u.id;
    req.user.email = u.email;
    next();
  });
}

module.exports = { sign, optionalAuth, requireAuth, requireAdmin, requireUploader };

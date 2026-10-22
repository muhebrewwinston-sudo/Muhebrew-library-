const jwt = require('jsonwebtoken');
const db = require('../db/database');

const SECRET = process.env.JWT_SECRET || 'muhebrew-fallback-jwt-secret-key-change-me';
const EXPIRES = process.env.JWT_EXPIRES || '30d';

const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: EXPIRES });

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
  try { req.user = jwt.verify(t, SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
}

// Role is always re-checked in the database, so role changes apply immediately
function requireRole(...roles) {
  return (req, res, next) => requireAuth(req, res, () => {
    const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (!u) return res.status(401).json({ error: 'Account not found. Please sign in again.' });
    if (!roles.includes(u.role)) {
      return res.status(403).json({ error: roles.includes('teacher') ? 'Only teachers and admins can upload.' : 'Admin access required.' });
    }
    req.user.role = u.role;
    next();
  });
}

const requireAdmin = requireRole('admin');
const requireUploader = requireRole('student', 'teacher', 'admin');

module.exports = { sign, optionalAuth, requireAuth, requireAdmin, requireUploader };

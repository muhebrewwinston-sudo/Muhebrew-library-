const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);
const TABLES = { papers: 'papers', books: 'books' };

router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().c;
  res.json({
    users: one('SELECT COUNT(*) c FROM users'),
    students: one("SELECT COUNT(*) c FROM users WHERE role='student'"),
    papers: one("SELECT COUNT(*) c FROM papers WHERE status='approved'"),
    books: one("SELECT COUNT(*) c FROM books WHERE status='approved'"),
    downloads: one('SELECT COUNT(*) c FROM downloads'),
    last7: one("SELECT COUNT(*) c FROM downloads WHERE created_at >= datetime('now','-7 days')")
  });
});

router.get('/users', (_req, res) => {
  res.json({ users: db.prepare('SELECT id,name,email,role,school,level,created_at FROM users ORDER BY id DESC LIMIT 200').all() });
});

router.patch('/users/:id/role', (req, res) => {
  const role = (req.body || {}).role;
  if (!['student', 'teacher', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: "You can't change your own role." });
  const r = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

router.get('/pending', (_req, res) => {
  const q = (t) => db.prepare('SELECT x.id,x.title,x.subject,x.level,x.created_at,u.name AS uploader FROM ' + t +
    " x LEFT JOIN users u ON u.id = x.uploaded_by WHERE x.status = 'pending' ORDER BY x.id").all().map((r) => ({ ...r, t }));
  res.json({ items: [...q('papers'), ...q('books')] });
});

router.post('/review/:type/:id', (req, res) => {
  const t = TABLES[req.params.type];
  const action = (req.body || {}).action;
  if (!t || !['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Bad request.' });
  const row = db.prepare('SELECT * FROM ' + t + ' WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found.' });
  if (action === 'approve') {
    db.prepare('UPDATE ' + t + " SET status = 'approved' WHERE id = ?").run(row.id);
  } else {
    for (const k of ['file_path', 'cover_path'])
      if (row[k]) fs.promises.unlink(path.join(__dirname, '..', row[k])).catch(() => {});
    db.prepare('DELETE FROM ' + t + ' WHERE id = ?').run(row.id);
  }
  res.json({ ok: true });
});

router.get('/reports', (_req, res) => {
  const rows = db.prepare('SELECT r.*, u.name AS reporter FROM reports r LEFT JOIN users u ON u.id = r.user_id WHERE r.resolved = 0 ORDER BY r.id DESC LIMIT 100').all();
  const items = rows.map((r) => {
    const t = r.item_type === 'paper' ? 'papers' : 'books';
    const it = db.prepare('SELECT title FROM ' + t + ' WHERE id = ?').get(r.item_id);
    return { id: r.id, t, item_id: r.item_id, title: it ? it.title : '(deleted)', reason: r.reason, reporter: r.reporter };
  });
  res.json({ items });
});

router.post('/reports/:id/resolve', (req, res) => {
  db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const drimeService = require('../services/drime');

const router = express.Router();
router.use(requireAdmin);
const TABLES = { papers: 'papers', books: 'books' };

router.get('/drime-status', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().c;
  const cloudPapers = one("SELECT COUNT(*) c FROM papers WHERE storage_provider = 'drime'");
  const cloudBooks = one("SELECT COUNT(*) c FROM books WHERE storage_provider = 'drime'");
  res.json({
    ...drimeService.getStatus(),
    cloudPapers,
    cloudBooks,
    totalCloudFiles: cloudPapers + cloudBooks
  });
});

router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().c;
  
  // Most favorite books that are mostly downloaded
  const favoriteBooks = db.prepare(`
    SELECT id, title, subject, level, category, author, downloads, cover_path, file_size, storage_provider, drime_url 
    FROM books WHERE status = 'approved' 
    ORDER BY downloads DESC, id ASC LIMIT 8
  `).all();

  // Most favorite papers that are mostly downloaded
  const favoritePapers = db.prepare(`
    SELECT id, title, subject, level, category, exam_board, year, downloads, file_size, storage_provider, drime_url 
    FROM papers WHERE status = 'approved' 
    ORDER BY downloads DESC, id ASC LIMIT 8
  `).all();

  const cloudPapers = one("SELECT COUNT(*) c FROM papers WHERE storage_provider = 'drime'");
  const cloudBooks = one("SELECT COUNT(*) c FROM books WHERE storage_provider = 'drime'");

  res.json({
    users: one('SELECT COUNT(*) c FROM users'),
    students: one("SELECT COUNT(*) c FROM users WHERE role='student'"),
    teachers: one("SELECT COUNT(*) c FROM users WHERE role='teacher'"),
    papers: one("SELECT COUNT(*) c FROM papers WHERE status='approved'"),
    books: one("SELECT COUNT(*) c FROM books WHERE status='approved'"),
    downloads: one('SELECT COUNT(*) c FROM downloads'),
    last7: one("SELECT COUNT(*) c FROM downloads WHERE created_at >= datetime('now','-7 days')"),
    favoriteBooks,
    favoritePapers,
    drime: {
      enabled: true,
      folderId: drimeService.DRIME_FOLDER_ID,
      folderUrl: drimeService.DRIME_FOLDER_URL,
      cloudPapers,
      cloudBooks,
      totalCloudFiles: cloudPapers + cloudBooks
    }
  });
});

router.get('/progression', (_req, res) => {
  // Recent user signups
  const signups = db.prepare(`
    SELECT id, name, email, role, school, level, created_at 
    FROM users ORDER BY id DESC LIMIT 10
  `).all();

  // Recent downloads activity
  const downloads = db.prepare(`
    SELECT d.id, d.item_type, d.item_id, d.created_at, u.name AS user_name, u.email AS user_email
    FROM downloads d
    LEFT JOIN users u ON u.id = d.user_id
    ORDER BY d.id DESC LIMIT 15
  `).all().map((dl) => {
    let title = 'Resource #' + dl.item_id;
    try {
      const table = dl.item_type === 'paper' ? 'papers' : 'books';
      const row = db.prepare('SELECT title FROM ' + table + ' WHERE id = ?').get(dl.item_id);
      if (row) title = row.title;
    } catch (_) {}
    return { ...dl, item_title: title };
  });

  // Recent resource uploads
  const uploads = [
    ...db.prepare("SELECT id, title, subject, level, 'paper' AS t, storage_provider, drime_url, created_at FROM papers ORDER BY id DESC LIMIT 8").all(),
    ...db.prepare("SELECT id, title, subject, level, 'book' AS t, storage_provider, drime_url, created_at FROM books ORDER BY id DESC LIMIT 8").all()
  ].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 10);

  res.json({ signups, downloads, uploads });
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

router.post('/grant-role', (req, res) => {
  const { email, role } = req.body || {};
  if (!email || !['student', 'teacher', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Valid email and role (student, teacher, admin) are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT id, name, role FROM users WHERE email = ?').get(cleanEmail);
  if (!user) {
    return res.status(404).json({ error: 'No user registered with that email.' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  res.json({ success: true, message: `Updated ${user.name} (${cleanEmail}) to ${role}.` });
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
  const rows = db.prepare(`
    SELECT r.*, u.name AS reporter, u.email AS reporter_email 
    FROM reports r 
    LEFT JOIN users u ON u.id = r.user_id 
    ORDER BY r.resolved ASC, r.id DESC LIMIT 100
  `).all();

  const items = rows.map((r) => {
    let title = 'General System Inquiry / Help';
    if (r.item_type === 'paper' || r.item_type === 'book') {
      const t = r.item_type === 'paper' ? 'papers' : 'books';
      const it = db.prepare('SELECT title FROM ' + t + ' WHERE id = ?').get(r.item_id);
      title = it ? it.title : '(Deleted file #' + r.item_id + ')';
    }
    return {
      id: r.id,
      t: r.item_type || 'help',
      item_id: r.item_id,
      title,
      reason: r.reason || 'Issue reported',
      details: r.details || '',
      reporter: r.reporter || r.email || r.reporter_email || 'Student',
      resolved: r.resolved,
      created_at: r.created_at
    };
  });
  res.json({ items });
});

router.post('/reports/:id/resolve', (req, res) => {
  db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/download-zip', (_req, res) => {
  const zipPath = path.join(__dirname, '..', 'muhebrew-backend-updated.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'muhebrew-backend-updated.zip');
  } else {
    res.status(404).json({ error: 'Zip file not found. Please generate it first.' });
  }
});

module.exports = router;

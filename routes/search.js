const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const level = req.query.level || null;
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const like = '%' + q + '%';

  const pw = ["status = 'approved'", '(title LIKE ? OR subject LIKE ? OR exam_board LIKE ?)'], pa = [like, like, like];
  const bw = ["status = 'approved'", '(title LIKE ? OR subject LIKE ? OR author LIKE ?)'], ba = [like, like, like];
  if (level) { pw.push('level = ?'); pa.push(level); bw.push('level = ?'); ba.push(level); }

  const papers = db.prepare("SELECT id,title,subject,level,year,exam_board,downloads,'paper' AS type FROM papers WHERE " +
    pw.join(' AND ') + ' ORDER BY downloads DESC LIMIT ?').all(...pa, limit);
  const books = db.prepare("SELECT id,title,subject,level,author,publisher,downloads,'book' AS type FROM books WHERE " +
    bw.join(' AND ') + ' ORDER BY downloads DESC LIMIT ?').all(...ba, limit);
  res.json({ papers, books, total: papers.length + books.length });
});

// Saved items of the signed-in user
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT item_type, item_id FROM bookmarks WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  const items = rows.map((r) => {
    const t = r.item_type === 'paper' ? 'papers' : 'books';
    const row = db.prepare('SELECT * FROM ' + t + " WHERE id = ? AND status = 'approved'").get(r.item_id);
    return row ? { ...row, _type: r.item_type } : null;
  }).filter(Boolean);
  res.json({ items });
});

// Public numbers for the home page
router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().c;
  res.json({
    papers: one("SELECT COUNT(*) c FROM papers WHERE status='approved'"),
    books: one("SELECT COUNT(*) c FROM books WHERE status='approved'"),
    downloads: one('SELECT COUNT(*) c FROM downloads')
  });
});

// A teacher's own uploads with their review status
router.get('/my-uploads', requireAuth, (req, res) => {
  const q = (t) => db.prepare('SELECT id,title,subject,level,status,created_at FROM ' + t +
    ' WHERE uploaded_by = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json({ items: [...q('papers').map((r) => ({ ...r, t: 'Paper' })), ...q('books').map((r) => ({ ...r, t: 'Book' }))] });
});

module.exports = router;

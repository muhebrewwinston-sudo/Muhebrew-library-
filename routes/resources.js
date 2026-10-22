const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const { optionalAuth, requireAuth, requireAdmin, requireUploader } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const SORTS = { recent: 'created_at DESC', popular: 'downloads DESC', title: 'title ASC', year: 'year DESC' };
const reportLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many reports. Try again later.' } });

function buildRouter(table, type) {
  const router = express.Router();
  const isBook = type === 'book';
  const fields = isBook
    ? ['title', 'author', 'publisher', 'subject', 'level', 'edition', 'isbn', 'description']
    : ['title', 'subject', 'level', 'year', 'exam_board', 'paper_no', 'description'];
  const getRow = (id) => db.prepare('SELECT * FROM ' + table + ' WHERE id = ?').get(id);
  const absPath = (row) => path.join(__dirname, '..', row.file_path);

  // Pending items are only visible to admins and to the teacher who uploaded them
  router.param('id', (req, res, next, id) => {
    optionalAuth(req, res, () => {
      const row = db.prepare('SELECT status, uploaded_by FROM ' + table + ' WHERE id = ?').get(id);
      const ok = !row || row.status === 'approved' ||
        (req.user && (req.user.role === 'admin' || req.user.id === row.uploaded_by));
      if (!ok) return res.status(404).json({ error: 'Resource not found.' });
      next();
    });
  });

  router.get('/', optionalAuth, (req, res) => {
    const { q, subject, level, year, board, sort = 'recent' } = req.query;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const where = ["status = 'approved'"], params = [];

    if (q) {
      const cols = isBook ? ['title', 'subject', 'author', 'publisher'] : ['title', 'subject', 'exam_board'];
      where.push('(' + cols.map((c) => c + ' LIKE ?').join(' OR ') + ')');
      cols.forEach(() => params.push('%' + q + '%'));
    }
    if (subject) { where.push('subject = ?'); params.push(subject); }
    if (level)   { where.push('level = ?');   params.push(level); }
    if (year)    { where.push('year = ?');    params.push(Number(year)); }
    if (board && !isBook) { where.push('exam_board = ?'); params.push(board); }

    const clause = 'WHERE ' + where.join(' AND ');
    const order = SORTS[sort] || SORTS.recent;
    const total = db.prepare('SELECT COUNT(*) c FROM ' + table + ' ' + clause).get(...params).c;
    const items = db.prepare('SELECT * FROM ' + table + ' ' + clause + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?')
      .all(...params, limit, (page - 1) * limit);
    res.json({ total, page, limit, pages: Math.ceil(total / limit) || 1, items });
  });

  router.get('/facets', (_req, res) => {
    const pick = (c) => db.prepare('SELECT DISTINCT ' + c + ' v FROM ' + table +
      " WHERE status = 'approved' AND " + c + " IS NOT NULL AND " + c + " != '' ORDER BY " + c).all().map((r) => r.v);
    res.json({ subjects: pick('subject'), levels: pick('level'), years: isBook ? [] : pick('year') });
  });

  router.get('/:id', optionalAuth, (req, res) => {
    const row = getRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resource not found.' });
    const saved = req.user
      ? !!db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND item_type=? AND item_id=?').get(req.user.id, type, row.id)
      : false;
    res.json({ item: row, saved });
  });

  router.get('/:id/preview', (req, res) => {
    const row = getRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resource not found.' });
    const abs = absPath(row);
    if (!abs.toLowerCase().endsWith('.pdf') || !fs.existsSync(abs))
      return res.status(404).json({ error: 'No preview available for this file.' });
    res.setHeader('Content-Disposition', 'inline');
    res.type('application/pdf');
    res.sendFile(abs);
  });

  router.get('/:id/download', optionalAuth, (req, res) => {
    const row = getRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resource not found.' });
    const abs = absPath(row);
    if (!fs.existsSync(abs)) return res.status(410).json({ error: 'File missing on server.' });
    db.prepare('UPDATE ' + table + ' SET downloads = downloads + 1 WHERE id = ?').run(row.id);
    db.prepare('INSERT INTO downloads (user_id,item_type,item_id) VALUES (?,?,?)')
      .run(req.user ? req.user.id : null, type, row.id);
    res.download(abs, row.file_name || path.basename(abs));
  });

  router.post('/:id/report', reportLimit, optionalAuth, (req, res) => {
    const row = getRow(req.params.id);
    if (!row || row.status !== 'approved') return res.status(404).json({ error: 'Resource not found.' });
    const reason = String((req.body || {}).reason || '').trim().slice(0, 300) || 'File is broken or wrong';
    const dup = req.user && db.prepare('SELECT 1 FROM reports WHERE user_id=? AND item_type=? AND item_id=? AND resolved=0')
      .get(req.user.id, type, row.id);
    if (!dup) db.prepare('INSERT INTO reports (user_id,item_type,item_id,reason) VALUES (?,?,?,?)')
      .run(req.user ? req.user.id : null, type, row.id, reason);
    res.json({ ok: true });
  });

  router.post('/:id/bookmark', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const has = db.prepare('SELECT id FROM bookmarks WHERE user_id=? AND item_type=? AND item_id=?').get(req.user.id, type, id);
    if (has) {
      db.prepare('DELETE FROM bookmarks WHERE id = ?').run(has.id);
      return res.json({ saved: false });
    }
    db.prepare('INSERT INTO bookmarks (user_id,item_type,item_id) VALUES (?,?,?)').run(req.user.id, type, id);
    res.json({ saved: true });
  });

  router.post('/',
    requireUploader,
    (req, _res, next) => { req.uploadType = type; next(); },
    upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
    (req, res) => {
      const body = req.body || {};
      const file = req.files && req.files.file && req.files.file[0];
      const cover = req.files && req.files.cover && req.files.cover[0];
      const discard = () => [file, cover].forEach((f) => f && fs.promises.unlink(f.path).catch(() => {}));
      if (!file) { discard(); return res.status(400).json({ error: 'A file is required.' }); }
      if (!body.title || !body.subject || !body.level) { discard(); return res.status(400).json({ error: 'Title, subject and level are required.' }); }

      const rel = (f) => path.relative(path.join(__dirname, '..'), f.path).split(path.sep).join('/');
      const cols = [...fields, 'file_path', 'file_name', 'file_size', 'mime_type', 'uploaded_by', 'status'];
      const vals = fields.map((f) => (f === 'year' ? (body[f] ? Number(body[f]) : null) : (body[f] || null)));
      vals.push(rel(file), file.originalname, file.size, file.mimetype, req.user.id, req.user.role === 'admin' ? 'approved' : 'pending');
      if (isBook) { cols.push('cover_path'); vals.push(cover ? rel(cover) : null); }

      const info = db.prepare(
        'INSERT INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')'
      ).run(...vals);
      res.status(201).json({ item: getRow(info.lastInsertRowid) });
    }
  );

  router.delete('/:id', requireAdmin, (req, res) => {
    const row = getRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resource not found.' });
    for (const k of ['file_path', 'cover_path']) {
      if (row[k]) fs.promises.unlink(path.join(__dirname, '..', row[k])).catch(() => {});
    }
    db.prepare('DELETE FROM ' + table + ' WHERE id = ?').run(row.id);
    db.prepare('DELETE FROM bookmarks WHERE item_type=? AND item_id=?').run(type, row.id);
    db.prepare('DELETE FROM reports WHERE item_type=? AND item_id=?').run(type, row.id);
    res.json({ deleted: true });
  });

  return router;
}

module.exports = { papers: buildRouter('papers', 'paper'), books: buildRouter('books', 'book') };

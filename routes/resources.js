const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const { optionalAuth, requireAuth, requireAdmin, requireUploader } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { calculateQuota } = require('../db/quota');

const SORTS = { recent: 'created_at DESC', popular: 'downloads DESC', title: 'title ASC', year: 'year DESC' };
const reportLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many reports. Try again later.' } });

function findDuplicate(table, type, body, file) {
  const isBook = type === 'book';
  const title = String(body.title || '').trim().toLowerCase();
  const subject = String(body.subject || '').trim().toLowerCase();
  const level = String(body.level || '').trim().toLowerCase();

  // 1. Exact title check
  let match = db.prepare('SELECT id, title FROM ' + table + ' WHERE LOWER(title) = ?').get(title);
  if (match) return match;

  if (!isBook) {
    const year = body.year ? Number(body.year) : null;
    const board = body.exam_board ? String(body.exam_board).trim().toLowerCase() : null;
    if (subject && level && year) {
      if (board) {
        match = db.prepare('SELECT id, title FROM papers WHERE LOWER(subject) = ? AND LOWER(level) = ? AND year = ? AND LOWER(exam_board) = ?').get(subject, level, year, board);
      } else {
        match = db.prepare('SELECT id, title FROM papers WHERE LOWER(subject) = ? AND LOWER(level) = ? AND year = ?').get(subject, level, year);
      }
      if (match) return match;
    }
  } else {
    const author = body.author ? String(body.author).trim().toLowerCase() : null;
    if (subject && level && author) {
      match = db.prepare('SELECT id, title FROM books WHERE LOWER(subject) = ? AND LOWER(level) = ? AND LOWER(author) = ?').get(subject, level, author);
      if (match) return match;
    }
  }

  // 2. Same original filename check
  if (file && file.originalname) {
    match = db.prepare('SELECT id, title FROM ' + table + ' WHERE LOWER(file_name) = ?').get(file.originalname.toLowerCase());
    if (match) return match;
  }

  return null;
}

function buildRouter(table, type) {
  const router = express.Router();
  const isBook = type === 'book';
  const fields = isBook
    ? ['title', 'author', 'publisher', 'subject', 'level', 'category', 'edition', 'isbn', 'description']
    : ['title', 'subject', 'level', 'category', 'year', 'exam_board', 'paper_no', 'description'];
  const getRow = (id) => db.prepare('SELECT * FROM ' + table + ' WHERE id = ?').get(id);
  const absPath = (row) => path.join(__dirname, '..', row.file_path);

  // Pending items are only visible to admins and to the uploader who submitted them
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
    const { q, subject, level, year, board, category, sort = 'recent' } = req.query;
    const limit = Math.min(Number(req.query.limit) || 24, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const where = ["status = 'approved'"], params = [];

    if (q) {
      const cols = isBook ? ['title', 'subject', 'author', 'publisher', 'category'] : ['title', 'subject', 'exam_board', 'category'];
      where.push('(' + cols.map((c) => c + ' LIKE ?').join(' OR ') + ')');
      cols.forEach(() => params.push('%' + q + '%'));
    }
    if (subject) { where.push('subject = ?'); params.push(subject); }
    if (level) {
      const l = level.trim().toLowerCase();
      if (l === 'jce') {
        where.push("(level IN ('Form 1', 'Form 2') OR LOWER(category) = 'jce')");
      } else if (l === 'msce') {
        where.push("(level IN ('Form 3', 'Form 4') OR LOWER(category) = 'msce')");
      } else {
        where.push('level = ?'); params.push(level);
      }
    }
    if (category) {
      const cat = category.trim().toLowerCase();
      if (cat === 'jce') {
        where.push("(level IN ('Form 1', 'Form 2') OR LOWER(category) = 'jce')");
      } else if (cat === 'msce') {
        where.push("(level IN ('Form 3', 'Form 4') OR LOWER(category) = 'msce')");
      } else {
        where.push('LOWER(category) = ?'); params.push(cat);
      }
    }
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

    // Download gating: require authentication
    if (!req.user) {
      return res.status(401).json({ error: 'Please sign in to download resources.' });
    }

    // Students have download limits unless unlocked via uploads
    if (req.user.role === 'student') {
      const alreadyDownloaded = db.prepare(
        'SELECT 1 FROM downloads WHERE user_id = ? AND item_type = ? AND item_id = ?'
      ).get(req.user.id, type, row.id);

      if (!alreadyDownloaded) {
        const quota = calculateQuota(req.user.id, 'student');
        if (quota.remaining <= 0) {
          return res.status(403).json({
            error: 'Download limit reached (' + quota.usedDownloads + '/' + quota.totalAllowed + '). Please upload a new past paper or book to unlock more downloads!',
            limitReached: true,
            remaining: 0,
            usedDownloads: quota.usedDownloads,
            totalAllowed: quota.totalAllowed,
            requiredAction: 'upload'
          });
        }
      }
    }

    db.prepare('UPDATE ' + table + ' SET downloads = downloads + 1 WHERE id = ?').run(row.id);
    db.prepare('INSERT INTO downloads (user_id,item_type,item_id) VALUES (?,?,?)')
      .run(req.user.id, type, row.id);
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

      // Check for duplicate uploads in the library ("which was not existing")
      const dup = findDuplicate(table, type, body, file);
      if (dup) {
        discard();
        return res.status(400).json({
          error: 'This resource ("' + dup.title + '") already exists in the library. Please upload a resource that is not yet in the library to unlock downloads.',
          isDuplicate: true
        });
      }

      const rel = (f) => path.relative(path.join(__dirname, '..'), f.path).split(path.sep).join('/');
      const cols = [...fields, 'file_path', 'file_name', 'file_size', 'mime_type', 'uploaded_by', 'status'];
      const defaultCategory = isBook ? 'MSCE' : 'MANEB';
      const vals = fields.map((f) => {
        if (f === 'year') return body[f] ? Number(body[f]) : null;
        if (f === 'category') return body[f] || defaultCategory;
        return body[f] || null;
      });
      vals.push(rel(file), file.originalname, file.size, file.mimetype, req.user.id, req.user.role === 'admin' ? 'approved' : 'pending');
      if (isBook) { cols.push('cover_path'); vals.push(cover ? rel(cover) : null); }

      const info = db.prepare(
        'INSERT INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')'
      ).run(...vals);

      const quota = calculateQuota(req.user.id, req.user.role);

      res.status(201).json({
        item: getRow(info.lastInsertRowid),
        message: req.user.role === 'student'
          ? 'Resource submitted successfully! You unlocked 5 more downloads.'
          : 'Resource uploaded successfully.',
        unlockedDownloads: req.user.role === 'student' ? 5 : 0,
        quota
      });
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

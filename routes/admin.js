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

const { buildBackendZip } = require('../utils/zip');
const { autoTraceFile } = require('../utils/autotrace');
const { upload } = require('../middleware/upload');

// 1. Auto-Trace Single or Multiple Filename Details
router.post('/trace-file', (req, res) => {
  const { filename, fileSize } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'Filename is required.' });
  const traced = autoTraceFile(filename, fileSize);
  res.json({ success: true, ...traced, traced });
});

// 2. Upload Single Auto-Traced Item (used by interactive bulk queue or single-upload)
router.post('/upload-item', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'File is required.' });

  try {
    const body = req.body || {};
    const traced = autoTraceFile(file.originalname, file.size);
    const type = body.type === 'books' || (!body.type && traced.type === 'books') ? 'books' : 'papers';
    const isBook = type === 'books';
    const table = isBook ? 'books' : 'papers';

    const title = (body.title || traced.title || file.originalname).trim();
    const subject = (body.subject || traced.subject || 'General Studies').trim();
    const level = (body.level || traced.level || 'Form 4').trim();
    const category = (body.category || traced.category || (isBook ? 'MSCE' : 'MANEB')).trim();
    const year = !isBook && (body.year || traced.year) ? Number(body.year || traced.year) : null;
    const exam_board = !isBook ? (body.exam_board || traced.exam_board || 'MANEB').trim() : null;
    const author = isBook ? (body.author || traced.author || '').trim() : null;
    const description = (body.description || traced.description || '').trim();

    // Check duplicate
    const existing = db.prepare(`SELECT id, title FROM ${table} WHERE LOWER(title) = ?`).get(title.toLowerCase());
    if (existing) {
      try { await fs.promises.unlink(file.path); } catch (_) {}
      return res.status(400).json({ error: `Resource with title "${existing.title}" already exists.` });
    }

    // Sync to Drime Cloud Storage
    let storageProvider = 'drime';
    let drimeFileId = null;
    let drimeUrl = null;
    let drimeFolderId = null;

    try {
      const drimeRes = await drimeService.uploadToDrime({
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folderId: body.drime_folder_id || drimeService.DRIME_FOLDER_ID
      });
      drimeFileId = drimeRes.fileId;
      drimeUrl = body.drime_link ? body.drime_link.trim() : (drimeRes.url || drimeService.DRIME_FOLDER_URL);
      drimeFolderId = drimeRes.folderId || drimeService.DRIME_FOLDER_ID;
    } catch (drimeErr) {
      console.error('[Admin Bulk Upload] Drime sync error:', drimeErr.message);
      drimeUrl = drimeService.DRIME_FOLDER_URL;
      drimeFolderId = drimeService.DRIME_FOLDER_ID;
    }

    // Unlink local temp file in line with Drime cloud storage requirements
    try {
      await fs.promises.unlink(file.path);
    } catch (_) {}

    const storedPath = `drime://${drimeFileId || file.originalname}`;

    let info;
    if (isBook) {
      info = db.prepare(`
        INSERT INTO books (title, subject, level, category, author, description, file_path, file_name, file_size, mime_type, storage_provider, drime_file_id, drime_url, drime_folder_id, uploaded_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
      `).run(title, subject, level, category, author, description, storedPath, file.originalname, file.size, file.mimetype, storageProvider, drimeFileId, drimeUrl, drimeFolderId, req.user.id);
    } else {
      info = db.prepare(`
        INSERT INTO papers (title, subject, level, category, year, exam_board, description, file_path, file_name, file_size, mime_type, storage_provider, drime_file_id, drime_url, drime_folder_id, uploaded_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
      `).run(title, subject, level, category, year, exam_board, description, storedPath, file.originalname, file.size, file.mimetype, storageProvider, drimeFileId, drimeUrl, drimeFolderId, req.user.id);
    }

    const createdItem = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json({
      success: true,
      type,
      item: createdItem,
      message: `Published "${title}" (${type === 'books' ? 'Textbook' : 'Past Paper'}) to Muhebrew Library.`
    });
  } catch (err) {
    console.error('[Admin Upload Item Error]', err);
    res.status(500).json({ error: err.message || 'Failed to publish resource.' });
  }
});

// 3. Batch Bulk Upload Endpoint (Uploads multiple files at once)
router.post('/bulk-upload', upload.array('files', 100), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files provided for bulk upload.' });

  let metaMap = {};
  if (req.body.metadata) {
    try {
      const parsed = JSON.parse(req.body.metadata);
      if (Array.isArray(parsed)) {
        parsed.forEach((m, idx) => {
          if (m.rawName) metaMap[m.rawName] = m;
          metaMap['idx_' + idx] = m;
        });
      }
    } catch (_) {}
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const traced = autoTraceFile(file.originalname, file.size);
      const meta = metaMap[file.originalname] || metaMap['idx_' + i] || {};

      const type = meta.type === 'books' || (!meta.type && traced.type === 'books') ? 'books' : 'papers';
      const isBook = type === 'books';
      const table = isBook ? 'books' : 'papers';

      const title = (meta.title || traced.title || file.originalname).trim();
      const subject = (meta.subject || traced.subject || 'General Studies').trim();
      const level = (meta.level || traced.level || 'Form 4').trim();
      const category = (meta.category || traced.category || (isBook ? 'MSCE' : 'MANEB')).trim();
      const year = !isBook && (meta.year || traced.year) ? Number(meta.year || traced.year) : null;
      const exam_board = !isBook ? (meta.exam_board || traced.exam_board || 'MANEB').trim() : null;
      const author = isBook ? (meta.author || traced.author || '').trim() : null;
      const description = (meta.description || traced.description || '').trim();

      // Check duplicate
      const existing = db.prepare(`SELECT id, title FROM ${table} WHERE LOWER(title) = ?`).get(title.toLowerCase());
      if (existing) {
        try { await fs.promises.unlink(file.path); } catch (_) {}
        errors.push({ filename: file.originalname, error: `Skipped duplicate: "${title}" is already in the library.` });
        continue;
      }

      // Sync to Drime Cloud Storage
      let storageProvider = 'drime';
      let drimeFileId = null;
      let drimeUrl = null;
      let drimeFolderId = null;

      try {
        const drimeRes = await drimeService.uploadToDrime({
          filePath: file.path,
          originalName: file.originalname,
          mimeType: file.mimetype,
          folderId: drimeService.DRIME_FOLDER_ID
        });
        drimeFileId = drimeRes.fileId;
        drimeUrl = drimeRes.url || drimeService.DRIME_FOLDER_URL;
        drimeFolderId = drimeRes.folderId || drimeService.DRIME_FOLDER_ID;
      } catch (err) {
        drimeUrl = drimeService.DRIME_FOLDER_URL;
        drimeFolderId = drimeService.DRIME_FOLDER_ID;
      }

      // Unlink temp file
      try {
        await fs.promises.unlink(file.path);
      } catch (_) {}

      const storedPath = `drime://${drimeFileId || file.originalname}`;

      let info;
      if (isBook) {
        info = db.prepare(`
          INSERT INTO books (title, subject, level, category, author, description, file_path, file_name, file_size, mime_type, storage_provider, drime_file_id, drime_url, drime_folder_id, uploaded_by, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
        `).run(title, subject, level, category, author, description, storedPath, file.originalname, file.size, file.mimetype, storageProvider, drimeFileId, drimeUrl, drimeFolderId, req.user.id);
      } else {
        info = db.prepare(`
          INSERT INTO papers (title, subject, level, category, year, exam_board, description, file_path, file_name, file_size, mime_type, storage_provider, drime_file_id, drime_url, drime_folder_id, uploaded_by, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
        `).run(title, subject, level, category, year, exam_board, description, storedPath, file.originalname, file.size, file.mimetype, storageProvider, drimeFileId, drimeUrl, drimeFolderId, req.user.id);
      }

      const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
      results.push({ ...created, _type: type });
    } catch (fileErr) {
      console.error('[Bulk upload file error]', file.originalname, fileErr.message);
      errors.push({ filename: file.originalname, error: fileErr.message });
      try { await fs.promises.unlink(file.path); } catch (_) {}
    }
  }

  res.status(201).json({
    success: true,
    count: results.length,
    items: results,
    errors,
    message: `Successfully processed ${results.length} files. All resources are now published and visible to students.`
  });
});

router.get('/download-zip', (_req, res) => {
  const zipPath = path.join(__dirname, '..', 'muhebrew-backend-updated.zip');
  if (!fs.existsSync(zipPath)) {
    buildBackendZip();
  }
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'muhebrew-backend-updated.zip');
  } else {
    res.status(500).json({ error: 'Failed to generate backend zip archive.' });
  }
});

module.exports = router;

// Dual-driver SQLite support: Node built-in (Node 22.5+) with better-sqlite3 fallback (Node 18/20/22)
const path = require('path');
const fs = require('fs');

let SQLiteDriver = null;

// 1. Try built-in node:sqlite (Node 22.5+)
try {
  const nodeSqlite = require('node:sqlite');
  if (nodeSqlite && nodeSqlite.DatabaseSync) {
    SQLiteDriver = nodeSqlite.DatabaseSync;
  }
} catch (_) {}

// 2. Fall back to better-sqlite3 (compatible across Node 18, 20, 22+)
if (!SQLiteDriver) {
  try {
    SQLiteDriver = require('better-sqlite3');
  } catch (_) {}
}

if (!SQLiteDriver) {
  console.error('\n[FATAL] No SQLite driver found!');
  console.error('Please either upgrade to Node.js 22.5+ or run: npm install better-sqlite3\n');
  process.exit(1);
}

// In Vercel serverless environment, filesystem is read-only except /tmp
const defaultDbPath = process.env.VERCEL
  ? path.join('/tmp', 'pasthub.db')
  : path.join(__dirname, 'pasthub.db');

const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);

// Ensure parent folder exists before opening SQLite database
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  try { fs.mkdirSync(dbDir, { recursive: true }); } catch (_) {}
}

// In Vercel, copy seed database to /tmp if it exists locally
if (process.env.VERCEL && !fs.existsSync(DB_PATH)) {
  const localDb = path.join(__dirname, 'pasthub.db');
  if (fs.existsSync(localDb)) {
    try { fs.copyFileSync(localDb, DB_PATH); } catch (_) {}
  }
}

class DB {
  constructor(file) {
    this._db = new SQLiteDriver(file);
  }
  pragma(stmt) {
    if (typeof this._db.pragma === 'function') {
      try { return this._db.pragma(stmt); } catch (_) {}
    }
    return this._db.exec('PRAGMA ' + stmt);
  }
  exec(sql) {
    return this._db.exec(sql);
  }
  prepare(sql) {
    const st = this._db.prepare(sql);
    return {
      get: (...a) => st.get(...a),
      all: (...a) => st.all(...a),
      run: (...a) => {
        const r = st.run(...a);
        return {
          changes: Number(r.changes || 0),
          lastInsertRowid: Number(r.lastInsertRowid || 0)
        };
      }
    };
  }
}

const db = new DB(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load schema from file or fallback string
const schemaFile = path.join(__dirname, 'schema.sql');
let schemaSql = '';
if (fs.existsSync(schemaFile)) {
  schemaSql = fs.readFileSync(schemaFile, 'utf8');
} else {
  schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  school TEXT,
  level TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  level TEXT NOT NULL,
  year INTEGER,
  exam_board TEXT,
  paper_no TEXT,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  subject TEXT NOT NULL,
  level TEXT NOT NULL,
  edition TEXT,
  isbn TEXT,
  description TEXT,
  cover_path TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, item_type, item_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_resolved ON reports(resolved);
  `.trim();
  try { fs.writeFileSync(schemaFile, schemaSql + '\n', 'utf8'); } catch (_) {}
}

db.exec(schemaSql);

// Older databases get the "status", "category", and Drime Cloud Storage columns
for (const t of ['papers', 'books']) {
  const cols = db.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name);
  if (!cols.includes('status')) db.exec('ALTER TABLE ' + t + " ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  if (!cols.includes('category')) db.exec('ALTER TABLE ' + t + " ADD COLUMN category TEXT DEFAULT '" + (t === 'books' ? 'MSCE' : 'MANEB') + "'");
  if (!cols.includes('storage_provider')) db.exec('ALTER TABLE ' + t + " ADD COLUMN storage_provider TEXT DEFAULT 'local'");
  if (!cols.includes('drime_file_id')) db.exec('ALTER TABLE ' + t + ' ADD COLUMN drime_file_id TEXT');
  if (!cols.includes('drime_url')) db.exec('ALTER TABLE ' + t + ' ADD COLUMN drime_url TEXT');
  if (!cols.includes('drime_folder_id')) db.exec('ALTER TABLE ' + t + ' ADD COLUMN drime_folder_id TEXT');
}

// Ensure papers table has cover_path column
try {
  const paperCols = db.prepare('PRAGMA table_info(papers)').all().map((c) => c.name);
  if (!paperCols.includes('cover_path')) db.exec('ALTER TABLE papers ADD COLUMN cover_path TEXT');
} catch (_) {}

// Ensure reports table has details and email columns
try {
  const reportCols = db.prepare('PRAGMA table_info(reports)').all().map((c) => c.name);
  if (!reportCols.includes('details')) db.exec('ALTER TABLE reports ADD COLUMN details TEXT');
  if (!reportCols.includes('email')) db.exec('ALTER TABLE reports ADD COLUMN email TEXT');
} catch (_) {}

// Ensure users table has bonus_downloads and email verification columns
try {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('bonus_downloads')) {
    db.exec('ALTER TABLE users ADD COLUMN bonus_downloads INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols.includes('is_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 1');
  }
  if (!userCols.includes('verify_code')) {
    db.exec('ALTER TABLE users ADD COLUMN verify_code TEXT');
  }
  if (!userCols.includes('verify_expires')) {
    db.exec('ALTER TABLE users ADD COLUMN verify_expires TEXT');
  }
  if (!userCols.includes('reset_code')) {
    db.exec('ALTER TABLE users ADD COLUMN reset_code TEXT');
  }
  if (!userCols.includes('reset_expires')) {
    db.exec('ALTER TABLE users ADD COLUMN reset_expires TEXT');
  }
} catch (_) {}

// Clean existing paper titles ending with (Form 1..4)
try {
  const papersWithForm = db.prepare("SELECT id, title FROM papers WHERE title LIKE '%(Form %'").all();
  for (const p of papersWithForm) {
    const clean = p.title.replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '').replace(/\s+Form\s*[1-4]\s*$/i, '').trim();
    if (clean !== p.title) {
      db.prepare('UPDATE papers SET title = ? WHERE id = ?').run(clean, p.id);
    }
  }
} catch (_) {}

// Ensure muhebrewwinston@gmail.com is always role = 'admin', owner and verified
try {
  const owner = db.prepare("SELECT id FROM users WHERE LOWER(email) = 'muhebrewwinston@gmail.com'").get();
  if (owner) {
    db.prepare("UPDATE users SET role = 'admin', is_verified = 1 WHERE id = ?").run(owner.id);
  }
} catch (_) {}

// Persistent User Registry: keeps users registered even across restarts, Vercel redeploys, or backend changes
const registryFile = path.join(__dirname, 'users_registry.json');

function syncUsersFromRegistry() {
  try {
    if (!fs.existsSync(registryFile)) return;
    const users = JSON.parse(fs.readFileSync(registryFile, 'utf8') || '[]');
    if (!Array.isArray(users)) return;

    for (const u of users) {
      if (!u || !u.email) continue;
      const cleanEmail = String(u.email).trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
      if (!existing) {
        db.prepare(`
          INSERT INTO users (name, email, password_hash, role, school, level, bonus_downloads, is_verified, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          u.name || 'User',
          cleanEmail,
          u.password_hash,
          u.role || 'student',
          u.school || null,
          u.level || null,
          u.bonus_downloads || 0,
          u.is_verified ?? 1,
          u.created_at || new Date().toISOString()
        );
      } else {
        db.prepare(`
          UPDATE users SET 
            password_hash = COALESCE(?, password_hash),
            role = COALESCE(?, role),
            is_verified = COALESCE(?, is_verified),
            bonus_downloads = COALESCE(?, bonus_downloads)
          WHERE id = ?
        `).run(u.password_hash || null, u.role || null, u.is_verified ?? null, u.bonus_downloads ?? null, existing.id);
      }
    }
  } catch (err) {
    console.warn('[DB] User restore from registry error:', err.message);
  }
}

function saveUsersToRegistry() {
  try {
    const allUsers = db.prepare('SELECT id, name, email, password_hash, role, school, level, bonus_downloads, is_verified, created_at FROM users').all();
    fs.writeFileSync(registryFile, JSON.stringify(allUsers, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DB] User backup to registry error:', err.message);
  }
}

// Automatically sync previously registered users upon database boot
syncUsersFromRegistry();

// Persistent Drime Catalog Registry: ensures past papers, marking keys, and books are never lost
const catalogFile = path.join(__dirname, 'drime_catalog.json');

function syncCatalogFromRegistry() {
  try {
    // Purge any primary school files (library is exclusively secondary Form 1 to Form 4)
    db.prepare(`
      DELETE FROM papers WHERE 
        LOWER(title) LIKE '%standard%' OR LOWER(title) LIKE '%pslce%' OR LOWER(title) LIKE '%primary%'
        OR LOWER(level) LIKE '%standard%' OR LOWER(level) LIKE '%primary%'
    `).run();
    db.prepare(`
      DELETE FROM books WHERE 
        LOWER(title) LIKE '%standard%' OR LOWER(title) LIKE '%pslce%' OR LOWER(title) LIKE '%primary%'
        OR LOWER(level) LIKE '%standard%' OR LOWER(level) LIKE '%primary%'
    `).run();

    // Purge any dummy sample test placeholders (official government project standard)
    db.prepare(`
      DELETE FROM papers WHERE 
        LOWER(title) LIKE '%sample%' OR LOWER(file_name) LIKE '%sample%' OR LOWER(file_path) LIKE '%sample%'
        OR LOWER(file_name) LIKE 'key-%'
    `).run();
    db.prepare(`
      DELETE FROM books WHERE 
        LOWER(title) LIKE '%sample%' OR LOWER(file_name) LIKE '%sample%' OR LOWER(file_path) LIKE '%sample%'
        OR LOWER(file_name) LIKE 'book-%'
    `).run();

    if (!fs.existsSync(catalogFile)) return;
    const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8') || '{}');
    const papers = Array.isArray(catalog.papers) ? catalog.papers : [];
    const books = Array.isArray(catalog.books) ? catalog.books : [];

    const { isPrimarySchoolFile } = require('../utils/autotrace');

    for (const p of papers) {
      if (!p || !p.title) continue;
      // Exclude every primary school file
      if (isPrimarySchoolFile(p.title, '', p.file_name) || String(p.level || '').toLowerCase().includes('standard') || String(p.level || '').toLowerCase().includes('primary')) {
        continue;
      }
      const cleanTitle = String(p.title).trim();
      const existing = db.prepare('SELECT id FROM papers WHERE LOWER(title) = ? OR file_name = ?').get(cleanTitle.toLowerCase(), p.file_name);
      if (!existing) {
        db.prepare(`
          INSERT INTO papers (
            title, subject, level, category, year, exam_board, paper_no, description,
            file_path, file_name, file_size, mime_type,
            storage_provider, drime_file_id, drime_url, drime_folder_id, status, downloads
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cleanTitle,
          p.subject || 'General Studies',
          p.level || 'Form 4',
          p.category || 'MANEB',
          p.year || new Date().getFullYear(),
          p.exam_board || 'MANEB',
          p.paper_no || null,
          p.description || 'Drime Cloud past paper',
          p.file_path || ('drime://' + (p.drime_file_id || 'file')),
          p.file_name || (cleanTitle + '.pdf'),
          p.file_size || 1024,
          p.mime_type || 'application/pdf',
          p.storage_provider || 'drime',
          p.drime_file_id || null,
          p.drime_url || 'https://dri.me/fngud8DkQTOTNvd1MmAXhszXKIm60k',
          p.drime_folder_id || 'fngud8DkQTOTNvd1MmAXhszXKIm60k',
          p.status || 'approved',
          p.downloads || 0
        );
      } else {
        db.prepare(`
          UPDATE papers SET
            title = ?, subject = ?, level = ?, category = ?, year = ?, exam_board = ?, paper_no = ?,
            description = ?, file_path = ?, file_name = ?, file_size = ?, mime_type = ?,
            storage_provider = ?, drime_file_id = ?, drime_url = ?, drime_folder_id = ?, status = 'approved'
          WHERE id = ?
        `).run(
          cleanTitle,
          p.subject || 'General Studies',
          p.level || 'Form 4',
          p.category || 'MANEB',
          p.year || new Date().getFullYear(),
          p.exam_board || 'MANEB',
          p.paper_no || null,
          p.description || 'Drime Cloud past paper',
          p.file_path || ('drime://' + (p.drime_file_id || 'file')),
          p.file_name || (cleanTitle + '.pdf'),
          p.file_size || 1024,
          p.mime_type || 'application/pdf',
          p.storage_provider || 'drime',
          p.drime_file_id || null,
          p.drime_url || 'https://dri.me/fngud8DkQTOTNvd1MmAXhszXKIm60k',
          p.drime_folder_id || 'fngud8DkQTOTNvd1MmAXhszXKIm60k',
          existing.id
        );
      }
    }

    for (const b of books) {
      if (!b || !b.title) continue;
      const cleanTitle = String(b.title).trim();
      const existing = db.prepare('SELECT id FROM books WHERE LOWER(title) = ? OR file_name = ?').get(cleanTitle.toLowerCase(), b.file_name);
      if (!existing) {
        db.prepare(`
          INSERT INTO books (
            title, author, publisher, subject, level, category, edition, isbn, description,
            cover_path, file_path, file_name, file_size, mime_type,
            storage_provider, drime_file_id, drime_url, drime_folder_id, status, downloads
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cleanTitle,
          b.author || 'Ministry of Education',
          b.publisher || null,
          b.subject || 'General Studies',
          b.level || 'Form 4',
          b.category || 'MSCE',
          b.edition || null,
          b.isbn || null,
          b.description || 'Drime Cloud textbook',
          b.cover_path || null,
          b.file_path || ('drime://' + (b.drime_file_id || 'file')),
          b.file_name || (cleanTitle + '.pdf'),
          b.file_size || 1024,
          b.mime_type || 'application/pdf',
          b.storage_provider || 'drime',
          b.drime_file_id || null,
          b.drime_url || 'https://dri.me/fngud8DkQTOTNvd1MmAXhszXKIm60k',
          b.drime_folder_id || 'fngud8DkQTOTNvd1MmAXhszXKIm60k',
          b.status || 'approved',
          b.downloads || 0
        );
      } else {
        db.prepare(`
          UPDATE books SET
            title = ?, author = ?, publisher = ?, subject = ?, level = ?, category = ?, edition = ?, isbn = ?,
            description = ?, cover_path = ?, file_path = ?, file_name = ?, file_size = ?, mime_type = ?,
            storage_provider = ?, drime_file_id = ?, drime_url = ?, drime_folder_id = ?, status = 'approved'
          WHERE id = ?
        `).run(
          cleanTitle,
          b.author || 'Ministry of Education',
          b.publisher || null,
          b.subject || 'General Studies',
          b.level || 'Form 4',
          b.category || 'MSCE',
          b.edition || null,
          b.isbn || null,
          b.description || 'Drime Cloud textbook',
          b.cover_path || null,
          b.file_path || ('drime://' + (b.drime_file_id || 'file')),
          b.file_name || (cleanTitle + '.pdf'),
          b.file_size || 1024,
          b.mime_type || 'application/pdf',
          b.storage_provider || 'drime',
          b.drime_file_id || null,
          b.drime_url || 'https://dri.me/fngud8DkQTOTNvd1MmAXhszXKIm60k',
          b.drime_folder_id || 'fngud8DkQTOTNvd1MmAXhszXKIm60k',
          existing.id
        );
      }
    }
  } catch (err) {
    console.warn('[DB] Catalog restore from registry error:', err.message);
  }
}

function saveCatalogToRegistry() {
  try {
    const papers = db.prepare("SELECT * FROM papers WHERE status = 'approved'").all();
    const books = db.prepare("SELECT * FROM books WHERE status = 'approved'").all();
    fs.writeFileSync(catalogFile, JSON.stringify({ papers, books }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DB] Catalog backup error:', err.message);
  }
}

// Automatically sync catalog upon database boot
syncCatalogFromRegistry();

// Export helpers alongside database instance
db.saveUsersToRegistry = saveUsersToRegistry;
db.syncUsersFromRegistry = syncUsersFromRegistry;
db.saveCatalogToRegistry = saveCatalogToRegistry;
db.syncCatalogFromRegistry = syncCatalogFromRegistry;

module.exports = db;

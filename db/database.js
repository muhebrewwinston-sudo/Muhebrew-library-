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

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'pasthub.db'));

// Ensure parent folder exists before opening SQLite database
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
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

// Older databases get the "status" column (existing items stay approved)
for (const t of ['papers', 'books']) {
  const cols = db.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name);
  if (!cols.includes('status')) db.exec('ALTER TABLE ' + t + " ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
}

// Ensure users table has bonus_downloads column
try {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('bonus_downloads')) {
    db.exec('ALTER TABLE users ADD COLUMN bonus_downloads INTEGER NOT NULL DEFAULT 0');
  }
} catch (_) {}

module.exports = db;

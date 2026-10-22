require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Ensure JWT_SECRET is set; auto-generate and create .env if missing to prevent hosting crash
if (!process.env.JWT_SECRET) {
  const envPath = path.join(__dirname, '.env');
  const genSecret = require('crypto').randomBytes(32).toString('hex');
  process.env.JWT_SECRET = genSecret;
  if (!fs.existsSync(envPath)) {
    try {
      fs.writeFileSync(envPath, [
        'PORT=' + (process.env.PORT || process.env.SERVER_PORT || 3000),
        'JWT_SECRET=' + genSecret,
        'JWT_EXPIRES=30d',
        'DB_PATH=./db/pasthub.db',
        'MAX_UPLOAD_MB=40',
        ''
      ].join('\n'));
      console.log('[Setup] Automatically created .env with fresh JWT_SECRET.');
    } catch (_) {
      console.warn('[Warning] Running with in-memory JWT_SECRET (could not write .env).');
    }
  }
}

// Ensure required upload folders exist
const uploadDirs = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads', 'covers'),
  path.join(__dirname, 'uploads', 'papers'),
  path.join(__dirname, 'uploads', 'books')
];
uploadDirs.forEach((d) => {
  if (!fs.existsSync(d)) {
    try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  }
});

const authRoutes = require('./routes/auth');
const resources = require('./routes/resources');
const searchRoutes = require('./routes/search');
const adminRoutes = require('./routes/admin');

// Ensure owner account muhebrewwinston@gmail.com exists
try {
  const db = require('./db/database');
  const bcrypt = require('bcryptjs');
  const owner = db.prepare("SELECT id FROM users WHERE LOWER(email) = 'muhebrewwinston@gmail.com'").get();
  if (!owner) {
    const hash = bcrypt.hashSync('winston2026', 10);
    db.prepare(
      "INSERT INTO users (name, email, password_hash, role, school, level, is_verified) VALUES ('Winston Kamiza', 'muhebrewwinston@gmail.com', ?, 'admin', 'Lilongwe Secondary', 'Admin', 1)"
    ).run(hash);
    console.log('[Auth] Registered owner admin account: muhebrewwinston@gmail.com');
  } else {
    db.prepare("UPDATE users SET role = 'admin', is_verified = 1 WHERE id = ?").run(owner.id);
  }
} catch (err) {
  console.warn('[Warning] Owner check:', err.message);
}

const app = express();
// Support standard PORT as well as Pterodactyl/X Systems SERVER_PORT
const PORT = Number(process.env.PORT || process.env.SERVER_PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const browseLimit = rateLimit({ windowMs: 60 * 1000, max: 300 });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Too many attempts. Try again shortly.' } });

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Muhebrew Library' }));
app.use('/api/auth', authLimit, authRoutes);
app.use('/api/papers', browseLimit, resources.papers);
app.use('/api/books', browseLimit, resources.books);
app.use('/api/search', browseLimit, searchRoutes);
app.use('/api/admin', adminRoutes);

// Only book covers are public. Papers and books are served through the API
// (so pending uploads stay hidden until approved).
app.use('/uploads/covers', express.static(path.join(__dirname, 'uploads', 'covers'), { maxAge: '7d' }));

// Determine static frontend directory (supports both public/ and root directory)
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(express.static(publicDir));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((_req, res) => {
  const indexFile = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send('Not found');
  }
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : err.message });
});

// Bind to 0.0.0.0 so Pterodactyl container and proxy can reach it
app.listen(PORT, '0.0.0.0', () => {
  console.log('Muhebrew Library running -> http://0.0.0.0:' + PORT);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

module.exports = app;

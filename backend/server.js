require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const telemetry = require('./services/telemetry');

// Initialize in-memory console interceptor to power live admin telemetry
telemetry.initConsoleInterceptor();

// Ensure stable, persistent JWT_SECRET so existing user logins remain valid across restarts and deploys
const PERMANENT_JWT_SECRET = 'muhebrew-production-auth-permanent-jwt-secret-key-2026-persistent';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = PERMANENT_JWT_SECRET;
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    try {
      fs.writeFileSync(envPath, [
        'PORT=' + (process.env.PORT || process.env.SERVER_PORT || 3000),
        'JWT_SECRET=' + PERMANENT_JWT_SECRET,
        'JWT_EXPIRES=30d',
        'DB_PATH=./db/pasthub.db',
        'MAX_UPLOAD_MB=40',
        ''
      ].join('\n'));
      console.log('[Setup] Automatically initialized .env with permanent JWT_SECRET.');
    } catch (_) {}
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
const webhookRoutes = require('./routes/webhook');
const autoUpdater = require('./services/autoUpdater');

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
app.use(telemetry.requestTracker);

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
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

const browseLimit = rateLimit({ windowMs: 60 * 1000, max: 300 });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Too many attempts. Try again shortly.' } });

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Muhebrew Library' }));
app.use('/api/webhook', webhookRoutes);
app.use('/api/auth', authLimit, authRoutes);
app.use('/api/papers', browseLimit, resources.papers);
app.use('/api/books', browseLimit, resources.books);
app.use('/api/search', browseLimit, searchRoutes);
app.use('/api/admin', adminRoutes);

// Only book covers are public. Papers and books are served through the API
// (so pending uploads stay hidden until approved).
app.use('/uploads/covers', express.static(path.join(__dirname, 'uploads', 'covers'), { maxAge: '7d' }));
app.use('/uploads/thumbnails', express.static(path.join(__dirname, 'uploads', 'thumbnails'), { maxAge: '7d' }));

// Direct download for complete backend package
const { buildBackendZip } = require('./utils/zip');

const handleZipDownload = (_req, res) => {
  const rootDir = path.join(__dirname, '..');
  let zipPath = path.join(rootDir, 'muhebrew-backend-updated.zip');
  if (!fs.existsSync(zipPath)) {
    zipPath = path.join(__dirname, 'muhebrew-backend-updated.zip');
  }
  if (!fs.existsSync(zipPath)) {
    buildBackendZip();
  }
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'muhebrew-backend-updated.zip');
  } else {
    res.status(500).send('Zip generation failed');
  }
};

app.get('/muhebrew-backend-updated.zip', handleZipDownload);
app.get('/backend.zip', handleZipDownload);
app.get('/download-zip', handleZipDownload);

// Determine static frontend directory (supports frontend/, public/, parent folder, or current directory)
const frontendDir = path.join(__dirname, '..', 'frontend');
const publicDir = fs.existsSync(frontendDir)
  ? frontendDir
  : (fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : (fs.existsSync(path.join(__dirname, '..', 'index.html')) ? path.join(__dirname, '..') : __dirname));

app.use(express.static(publicDir, {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((_req, res) => {
  const indexFile = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
// In Vercel serverless environment, Vercel manages the HTTP server; skip app.listen
if (!process.env.VERCEL) {
  const isDirectRun = require.main === module ||
    (process.mainModule && process.mainModule.filename && process.mainModule.filename.includes('server.js'));

  if (isDirectRun) {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('Muhebrew Library running -> http://0.0.0.0:' + PORT);

      // Initialize background auto-update if enabled via AUTO_UPDATE or AUTO_UPDATE_POLL
      if (process.env.AUTO_UPDATE === 'true' || process.env.AUTO_UPDATE_POLL === 'true') {
        const pollMin = parseInt(process.env.AUTO_UPDATE_POLL_INTERVAL, 10) || 5;
        autoUpdater.startAutoPolling(pollMin);
      }

      // Automatic Drime Cloud sync on startup and 5-minute background polling
      try {
        const db = require('./db/database');
        const drimeService = require('./services/drime');
        drimeService.syncDrimeFilesToDatabase(db).then((res) => {
          if (res.ok) {
            console.log(`[Drime Auto-Sync] Startup sync: ${res.imported} imported, ${res.updated} updated (${res.total} files in Drime folder)`);
          }
        }).catch((e) => console.log('[Drime Auto-Sync] Startup note:', e.message));

        setInterval(() => {
          drimeService.syncDrimeFilesToDatabase(db).catch(() => {});
        }, 5 * 60 * 1000);
      } catch (e) {
        console.warn('[Drime Auto-Sync] Init note:', e.message);
      }
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.warn(`[Warning] Port ${PORT} already in use; skipping app.listen.`);
      } else {
        console.error('[Server Error]', e);
      }
    });
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

module.exports = app;

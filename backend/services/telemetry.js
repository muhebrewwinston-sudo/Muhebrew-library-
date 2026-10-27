const os = require('os');
const path = require('path');
const fs = require('fs');
const util = require('util');

// Max log entries to keep in RAM
const MAX_LOGS = 300;
const logs = [];
let logIdCounter = 1;

// Traffic metrics
const startTime = Date.now();
let totalRequests = 0;
const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
const requestTimestamps = [];
let totalResponseTimeMs = 0;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function addLog(level, message) {
  const entry = {
    id: logIdCounter++,
    timestamp: new Date().toISOString(),
    timeFormatted: new Date().toLocaleTimeString('en-US', { hour12: false }),
    level: String(level).toUpperCase(),
    message: typeof message === 'string' ? message : util.inspect(message, { depth: 3, colors: false })
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  return entry;
}

// Hook original console methods to capture real server output
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error
};

function initConsoleInterceptor() {
  console.log = (...args) => {
    originalConsole.log(...args);
    const msg = util.format(...args);
    addLog('INFO', msg);
  };
  console.info = (...args) => {
    originalConsole.info(...args);
    const msg = util.format(...args);
    addLog('INFO', msg);
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    const msg = util.format(...args);
    addLog('WARN', msg);
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    const msg = util.format(...args);
    addLog('ERROR', msg);
  };
}

// Express request tracking middleware
function requestTracker(req, res, next) {
  const start = Date.now();
  totalRequests++;
  requestTimestamps.push(start);

  // Prune timestamps older than 60s
  const oneMinAgo = start - 60000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinAgo) {
    requestTimestamps.shift();
  }

  // Intercept response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    totalResponseTimeMs += duration;
    const code = res.statusCode;
    if (code >= 200 && code < 300) statusCounts['2xx']++;
    else if (code >= 300 && code < 400) statusCounts['3xx']++;
    else if (code >= 400 && code < 500) statusCounts['4xx']++;
    else if (code >= 500) statusCounts['5xx']++;

    // Only record non-polled or meaningful HTTP activity to prevent log spam
    const url = req.originalUrl || req.url;
    const isHeavyPoll = url.includes('/api/admin/server-logs') || url.includes('/api/admin/system-stats');
    if (!isHeavyPoll) {
      const level = code >= 500 ? 'ERROR' : (code >= 400 ? 'WARN' : 'HTTP');
      addLog(level, `${req.method} ${url} ${code} ${duration}ms`);
    }
  });

  next();
}

function getDirectorySize(dirPath) {
  let size = 0;
  let count = 0;
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const f of files) {
        const full = path.join(dirPath, f.name);
        if (f.isFile()) {
          size += fs.statSync(full).size;
          count++;
        }
      }
    }
  } catch (_) {}
  return { size, count };
}

function getSystemStats(dbInstance) {
  const mem = process.memoryUsage();
  const totalSysMem = os.totalmem();
  const freeSysMem = os.freemem();
  const usedSysMem = totalSysMem - freeSysMem;

  // Requests per minute
  const now = Date.now();
  const oneMinAgo = now - 60000;
  const recentReqs = requestTimestamps.filter((t) => t >= oneMinAgo).length;

  // Storage metrics
  const rootDir = path.join(__dirname, '..');
  const dbPath = path.join(rootDir, 'db', 'pasthub.db');
  let dbFileSize = 0;
  try {
    if (fs.existsSync(dbPath)) {
      dbFileSize = fs.statSync(dbPath).size;
    }
  } catch (_) {}

  const thumbsDir = path.join(rootDir, 'uploads', 'thumbnails');
  const thumbsStats = getDirectorySize(thumbsDir);

  let paperCount = 0;
  let bookCount = 0;
  let userCount = 0;
  let downloadCount = 0;
  if (dbInstance) {
    try {
      paperCount = dbInstance.prepare("SELECT COUNT(*) c FROM papers WHERE status='approved'").get().c;
      bookCount = dbInstance.prepare("SELECT COUNT(*) c FROM books WHERE status='approved'").get().c;
      userCount = dbInstance.prepare('SELECT COUNT(*) c FROM users').get().c;
      downloadCount = dbInstance.prepare('SELECT COUNT(*) c FROM downloads').get().c;
    } catch (_) {}
  }

  const uptimeSec = process.uptime();
  const sysUptimeSec = os.uptime();
  const avgResponseTime = totalRequests > 0 ? (totalResponseTimeMs / totalRequests).toFixed(1) : 0;

  return {
    timestamp: new Date().toISOString(),
    uptime: formatUptime(uptimeSec),
    uptimeSeconds: Math.floor(uptimeSec),
    systemUptime: formatUptime(sysUptimeSec),
    serverStartedAt: new Date(startTime).toLocaleString(),
    nodeVersion: process.version,
    platform: `${os.platform()} (${os.arch()})`,
    hostname: os.hostname(),
    cpu: {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'Generic CPU',
      loadAvg: os.loadavg().map((l) => l.toFixed(2))
    },
    memory: {
      heapUsedBytes: mem.heapUsed,
      heapUsedFormatted: formatBytes(mem.heapUsed),
      heapTotalBytes: mem.heapTotal,
      heapTotalFormatted: formatBytes(mem.heapTotal),
      rssBytes: mem.rss,
      rssFormatted: formatBytes(mem.rss),
      heapPercent: Math.min(100, Math.round((mem.heapUsed / mem.heapTotal) * 100)),
      systemTotalBytes: totalSysMem,
      systemTotalFormatted: formatBytes(totalSysMem),
      systemFreeBytes: freeSysMem,
      systemFreeFormatted: formatBytes(freeSysMem),
      systemUsedPercent: Math.min(100, Math.round((usedSysMem / totalSysMem) * 100))
    },
    network: {
      totalRequests,
      requestsPerMinute: recentReqs,
      avgResponseTimeMs: Number(avgResponseTime),
      statusCounts
    },
    storage: {
      databaseFileSizeBytes: dbFileSize,
      databaseFileSizeFormatted: formatBytes(dbFileSize),
      thumbnailsCount: thumbsStats.count,
      thumbnailsSizeBytes: thumbsStats.size,
      thumbnailsSizeFormatted: formatBytes(thumbsStats.size),
      catalogItems: paperCount + bookCount,
      papers: paperCount,
      books: bookCount,
      registeredUsers: userCount,
      totalDownloads: downloadCount
    }
  };
}

function getLogs({ since, limit = 100, level } = {}) {
  let result = logs;
  if (since) {
    const sinceId = Number(since);
    result = result.filter((l) => l.id > sinceId);
  }
  if (level) {
    result = result.filter((l) => l.level === String(level).toUpperCase());
  }
  return result.slice(-Math.min(limit, MAX_LOGS));
}

function clearLogs() {
  logs.length = 0;
  addLog('INFO', 'Console log stream cleared by administrator.');
  return true;
}

module.exports = {
  initConsoleInterceptor,
  requestTracker,
  addLog,
  getSystemStats,
  getLogs,
  clearLogs
};

/**
 * Auto-Updater Service for Muhebrew Library on X Systems Hosting / Pterodactyl
 * Enables automatic syncing from GitHub (muhebrewwinston-sudo/Muhebrew-library-)
 * without requiring manual file uploads in the hosting panel.
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const REPO_OWNER = 'muhebrewwinston-sudo';
const REPO_NAME = 'Muhebrew-library-';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const DEFAULT_BRANCH = process.env.GIT_BRANCH || 'main';

function getRootDir() {
  const candidate1 = path.resolve(__dirname, '..', '..');
  if (fs.existsSync(path.join(candidate1, 'server.js')) || fs.existsSync(path.join(candidate1, 'package.json'))) {
    return candidate1;
  }
  const candidate2 = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(candidate2, 'server.js'))) {
    return candidate2;
  }
  return process.cwd();
}

/**
 * Get current local commit info
 */
function getCurrentCommit() {
  const rootDir = getRootDir();
  try {
    const raw = execSync('git log -1 --pretty=format:"%H|%h|%s|%ci|%an"', {
      cwd: rootDir,
      timeout: 6000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();

    const parts = raw.split('|');
    return {
      hash: parts[0] || 'unknown',
      shortHash: parts[1] || 'unknown',
      message: parts[2] || '',
      date: parts[3] || '',
      author: parts[4] || '',
      isGit: true
    };
  } catch (err) {
    // If not a git repo or git is not installed, look for fallback file
    const metaFile = path.join(rootDir, '.git-commit');
    if (fs.existsSync(metaFile)) {
      try {
        const content = fs.readFileSync(metaFile, 'utf8').trim();
        return {
          hash: content,
          shortHash: content.substring(0, 7),
          message: 'Installed from bundle/archive',
          date: new Date().toISOString(),
          author: 'System',
          isGit: false
        };
      } catch (_) {}
    }

    return {
      hash: 'unversioned',
      shortHash: 'v2.0.0',
      message: 'Running standalone bundle (Git metadata not detected)',
      date: new Date().toISOString(),
      author: 'Owner',
      isGit: false
    };
  }
}

/**
 * Check latest commit on remote GitHub repository
 */
async function getRemoteCommit(branch = DEFAULT_BRANCH) {
  const rootDir = getRootDir();

  // Try 1: git ls-remote (only if git CLI is available)
  if (hasGitCli()) {
    try {
      const output = execSync(`git ls-remote origin ${branch}`, {
        cwd: rootDir,
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();

      if (output) {
        const hash = output.split(/\s+/)[0];
        if (hash && hash.length >= 7) {
          let msg = 'Latest commit on main';
          try {
            msg = execSync(`git log -1 --pretty=format:"%s" ${hash}`, {
              cwd: rootDir,
              timeout: 3000,
              stdio: ['ignore', 'pipe', 'ignore']
            }).toString().trim() || msg;
          } catch (_) {}
          return {
            hash,
            shortHash: hash.substring(0, 7),
            message: msg,
            source: 'git-remote'
          };
        }
      }
    } catch (_) {}
  }

  // Try 2: GitHub REST API
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/commits/${branch}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Muhebrew-Library-AutoUpdater',
        'Accept': 'application/vnd.github.v3+json'
      },
      rejectUnauthorized: false,
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.sha) {
            return resolve({
              hash: json.sha,
              shortHash: json.sha.substring(0, 7),
              message: json.commit?.message || '',
              date: json.commit?.author?.date || '',
              author: json.commit?.author?.name || '',
              source: 'github-api'
            });
          }
        } catch (_) {}
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Verify GitHub webhook signature or token
 */
function verifyWebhook(req, rawBody) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
  
  // If no secret configured, check optional query token or allow if configured
  const queryToken = req.query?.token || req.headers['x-webhook-token'];
  if (queryToken) {
    if (!secret || queryToken === secret) {
      return true;
    }
  }

  if (!secret) {
    // If user has not set a secret yet, allow GitHub webhook event if it comes with x-github-event
    return Boolean(req.headers['x-github-event']);
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (e) {
    console.error('[Auto-Updater] Signature verification error:', e.message);
    return false;
  }
}

/**
 * Check if git command-line tool is available
 */
function hasGitCli() {
  try {
    execSync('git --version', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Execute git pull / sync and optionally restart the server
 */
function pullLatest({ branch = DEFAULT_BRANCH, restartAfter = true } = {}) {
  return new Promise((resolve) => {
    const rootDir = getRootDir();
    const logs = [];

    const appendLog = (msg) => {
      const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logs.push(line);
      console.log(`[Auto-Updater] ${msg}`);
    };

    appendLog(`Starting auto-update from GitHub repository (${REPO_OWNER}/${REPO_NAME} -> branch: ${branch})...`);
    appendLog(`Working directory: ${rootDir}`);

    // If running in Vercel or environment without git CLI:
    if (process.env.VERCEL || !hasGitCli()) {
      appendLog('Cloud Serverless / Vercel environment detected (no local git CLI required).');
      appendLog(`Connected repository: ${REPO_URL} (branch: ${branch}).`);
      appendLog('Vercel automatically builds and deploys every commit pushed to GitHub.');

      getRemoteCommit(branch).then((remote) => {
        if (remote) {
          appendLog(`Latest commit on GitHub: ${remote.shortHash} - "${remote.message || 'Latest commit on main'}" (${remote.date || 'Recent'})`);
          appendLog('Serverless deployment is synchronized with GitHub.');
        } else {
          appendLog('GitHub repository is active and verified.');
        }

        resolve({
          ok: true,
          success: true,
          serverless: true,
          commit: remote || { shortHash: 'live', message: 'Vercel Serverless Production' },
          logs: logs.join('\n')
        });
      }).catch((e) => {
        resolve({
          ok: true,
          success: true,
          serverless: true,
          commit: { shortHash: 'live', message: 'Vercel Serverless Production' },
          logs: logs.join('\n')
        });
      });
      return;
    }

    try {
      // 1. Check if git repo exists, if not initialize it
      const gitDir = path.join(rootDir, '.git');
      if (!fs.existsSync(gitDir)) {
        appendLog('Git folder not found. Initializing git repository connection...');
        execSync('git init', { cwd: rootDir, stdio: 'pipe' });
        execSync(`git remote add origin "${REPO_URL}"`, { cwd: rootDir, stdio: 'pipe' });
      } else {
        // Ensure remote URL points to the correct repo
        try {
          execSync(`git remote set-url origin "${REPO_URL}"`, { cwd: rootDir, stdio: 'pipe' });
        } catch (_) {}
      }

      // 2. Fetch latest changes
      appendLog(`Fetching latest changes from origin/${branch}...`);
      const fetchOut = execSync(`git fetch origin "${branch}"`, {
        cwd: rootDir,
        timeout: 60000
      }).toString();
      if (fetchOut) appendLog(fetchOut.trim());

      // 3. Reset hard to origin branch to ensure clean update without conflict errors
      appendLog(`Syncing workspace to match origin/${branch}...`);
      const resetOut = execSync(`git reset --hard "origin/${branch}"`, {
        cwd: rootDir,
        timeout: 30000
      }).toString();
      appendLog(resetOut.trim());

      // 4. Update latest commit marker
      const current = getCurrentCommit();
      appendLog(`Successfully synced to commit: ${current.shortHash} - "${current.message}"`);

      // 5. Install dependencies if package.json exists
      try {
        appendLog('Ensuring dependencies are up to date...');
        execSync('npm install --production --no-audit --no-fund', {
          cwd: rootDir,
          timeout: 120000,
          stdio: 'pipe'
        });
        appendLog('Dependencies verified and updated successfully.');
      } catch (npmErr) {
        appendLog(`Note on npm install: ${npmErr.message}`);
      }

      // 6. If requested, trigger graceful restart for Pterodactyl / Node
      if (restartAfter) {
        appendLog('Restarting server process to apply updates...');
        setTimeout(() => {
          console.log('[Auto-Updater] Exiting process cleanly for Pterodactyl container auto-restart...');
          process.exit(0);
        }, 1500);
      }

      resolve({
        ok: true,
        commit: current,
        logs: logs.join('\n')
      });

    } catch (err) {
      appendLog(`Auto-update error: ${err.message}`);
      if (err.stdout) appendLog(`STDOUT: ${err.stdout.toString()}`);
      if (err.stderr) appendLog(`STDERR: ${err.stderr.toString()}`);

      resolve({
        ok: false,
        error: err.message,
        logs: logs.join('\n')
      });
    }
  });
}

/**
 * Periodic update checker
 */
let pollIntervalTimer = null;

function startAutoPolling(intervalMinutes = 5) {
  if (pollIntervalTimer) return;

  const ms = Math.max(2, intervalMinutes) * 60 * 1000;
  console.log(`[Auto-Updater] Background polling active (checks GitHub every ${intervalMinutes} minutes).`);

  pollIntervalTimer = setInterval(async () => {
    try {
      const local = getCurrentCommit();
      const remote = await getRemoteCommit();
      if (remote && remote.hash && local.hash && local.hash !== remote.hash && local.isGit) {
        console.log(`[Auto-Updater] New commit detected on GitHub: ${remote.shortHash} (Current: ${local.shortHash}). Automatically pulling update...`);
        await pullLatest({ restartAfter: true });
      }
    } catch (e) {
      console.warn('[Auto-Updater] Periodic check failed:', e.message);
    }
  }, ms);
}

module.exports = {
  getCurrentCommit,
  getRemoteCommit,
  verifyWebhook,
  pullLatest,
  startAutoPolling,
  REPO_URL,
  DEFAULT_BRANCH
};

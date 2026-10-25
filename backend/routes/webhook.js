/**
 * Webhook Router for Automated GitHub Deployment
 * Enables automatic server updates whenever commits are pushed to GitHub.
 */

const express = require('express');
const router = express.Router();
const autoUpdater = require('../services/autoUpdater');

/**
 * GET /api/webhook/github - Information and status check
 */
router.get(['/', '/github', '/status'], async (req, res) => {
  const current = autoUpdater.getCurrentCommit();
  const remote = await autoUpdater.getRemoteCommit().catch(() => null);

  res.json({
    ok: true,
    service: 'Muhebrew Library Auto-Updater',
    connectedRepo: autoUpdater.REPO_URL,
    branch: autoUpdater.DEFAULT_BRANCH,
    currentCommit: current,
    remoteCommit: remote,
    hasUpdate: Boolean(remote?.hash && current?.hash && remote.hash !== current.hash),
    webhookEndpoint: '/api/webhook/github',
    setupInstructions: {
      githubSettingsUrl: `https://github.com/muhebrewwinston-sudo/Muhebrew-library-/settings/hooks`,
      payloadUrl: `${req.protocol}://${req.get('host')}/api/webhook/github`,
      contentType: 'application/json',
      events: ['Pushes']
    }
  });
});

/**
 * POST /api/webhook/github - GitHub Push Webhook Handler
 */
router.post(['/', '/github'], async (req, res) => {
  const event = req.headers['x-github-event'] || 'push';

  console.log(`[Webhook] Received incoming GitHub event: "${event}"`);

  // Handle GitHub ping test
  if (event === 'ping') {
    return res.json({
      ok: true,
      message: 'Ping event received! GitHub Webhook is successfully connected to Muhebrew Library.'
    });
  }

  // Verify signature or secret token
  const isAuthorized = autoUpdater.verifyWebhook(req, req.rawBody);
  if (!isAuthorized) {
    console.warn('[Webhook] Unauthorized webhook request: signature or token mismatch.');
    return res.status(401).json({ error: 'Unauthorized webhook request. Secret mismatch.' });
  }

  // If push event, inspect ref
  const ref = req.body?.ref;
  const expectedRef = `refs/heads/${autoUpdater.DEFAULT_BRANCH}`;

  if (ref && ref !== expectedRef) {
    console.log(`[Webhook] Push event on branch "${ref}" ignored (configured for "${expectedRef}").`);
    return res.json({
      ok: true,
      ignored: true,
      message: `Push was on branch "${ref}". Server tracks "${autoUpdater.DEFAULT_BRANCH}". No update triggered.`
    });
  }

  console.log(`[Webhook] Valid push event received on "${autoUpdater.DEFAULT_BRANCH}". Triggering auto-update...`);

  // Send fast 200 response to GitHub so the webhook does not time out
  res.json({
    ok: true,
    message: 'Webhook accepted. Pulling latest code and restarting server...'
  });

  // Asynchronously execute pull and restart
  setTimeout(async () => {
    try {
      const result = await autoUpdater.pullLatest({
        branch: autoUpdater.DEFAULT_BRANCH,
        restartAfter: true
      });
      console.log('[Webhook] Pull result:\n', result.logs);
    } catch (err) {
      console.error('[Webhook] Auto-update failed:', err);
    }
  }, 100);
});

/**
 * POST /api/webhook/sync - Manual trigger via secret token
 */
router.post('/sync', async (req, res) => {
  const isAuthorized = autoUpdater.verifyWebhook(req, req.rawBody);
  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized. Provide valid secret token.' });
  }

  try {
    const result = await autoUpdater.pullLatest({
      branch: autoUpdater.DEFAULT_BRANCH,
      restartAfter: req.body?.restart !== false
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

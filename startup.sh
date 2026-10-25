#!/bin/bash
# ==============================================================================
# Muhebrew Library - X Systems Hosting / Pterodactyl Auto-Updating Startup Script
# Automatically pulls the latest code from GitHub on server startup/restart
# ==============================================================================

set -e

REPO_URL="https://github.com/muhebrewwinston-sudo/Muhebrew-library-.git"
BRANCH="${GIT_BRANCH:-main}"

echo "=================================================================="
echo " Starting Muhebrew Library on X Systems Hosting"
echo " Connected Repository: $REPO_URL"
echo " Active Branch:        $BRANCH"
echo " Time:                 $(date)"
echo "=================================================================="

# Check if git is available
if command -v git >/dev/null 2>&1; then
    # 1. Initialize or connect git if not already present
    if [ ! -d ".git" ]; then
        echo "[Auto-Updater] Initializing local git repository connection..."
        git init
        git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
        echo "[Auto-Updater] Fetching latest files from GitHub ($BRANCH)..."
        git fetch origin "$BRANCH"
        git reset --hard "origin/$BRANCH"
        echo "[Auto-Updater] Installing dependencies..."
        npm install --production --no-audit --no-fund
    else
        # 2. Check for updates on GitHub
        echo "[Auto-Updater] Checking for new updates on GitHub ($BRANCH)..."
        git remote set-url origin "$REPO_URL" 2>/dev/null || true
        
        git fetch origin "$BRANCH" --quiet 2>/dev/null || true
        LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null || echo "none")
        REMOTE_HASH=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "none")

        if [ "$LOCAL_HASH" != "$REMOTE_HASH" ] && [ "$REMOTE_HASH" != "none" ]; then
            echo "[Auto-Updater] 🚀 New updates found on GitHub!"
            echo "[Auto-Updater] Local:  $LOCAL_HASH"
            echo "[Auto-Updater] Remote: $REMOTE_HASH"
            echo "[Auto-Updater] Syncing workspace with GitHub..."
            git reset --hard "origin/$BRANCH"
            echo "[Auto-Updater] Successfully updated to commit: $(git log -1 --oneline)"
            echo "[Auto-Updater] Updating Node.js dependencies..."
            npm install --production --no-audit --no-fund
        else
            echo "[Auto-Updater] ✓ Server is up to date with GitHub ($LOCAL_HASH)."
        fi
    fi
else
    echo "[Auto-Updater] Note: 'git' command not found in container environment."
    echo "[Auto-Updater] The built-in Node.js auto-updater service will handle syncs."
fi

echo "=================================================================="
echo " Launching Muhebrew Library Server..."
echo "=================================================================="

exec node server.js

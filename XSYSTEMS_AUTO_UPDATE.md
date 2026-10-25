# Connecting GitHub Repository to X Systems Hosting Server for Automatic Updates

This guide explains how to connect your GitHub repository (`muhebrewwinston-sudo/Muhebrew-library-`) to your **X Systems Hosting (Pterodactyl Panel)** server so that **any change pushed to GitHub automatically updates your server without manual file uploads**.

---

## 🚀 Quick Setup (Choose the method that fits your workflow)

### Method 1: Automatic Update on Every Server Startup (Easiest & Most Reliable)

X Systems Hosting runs on Pterodactyl. By updating your **Startup Command**, your server will automatically check GitHub, pull new code, and update packages every time the server starts or reboots.

1. Log into your **X Systems Hosting Game/Server Panel**.
2. Select your **Muhebrew Library** server.
3. Click on the **Startup** tab in the top navigation bar.
4. Locate the **Startup Command** field.
5. Change the command from `npm start` to:
   ```bash
   bash startup.sh
   ```
   *(or `npm run start:auto`)*
6. Save the settings.
7. Go to the **Console** tab and click **Restart**.

**How it works:**
Whenever you or Arena pushes a commit or merges a pull request on GitHub, you can simply click **Restart** in your panel (or use the Admin button), and the server will automatically pull the newest commits, update dependencies, and launch with the fresh code!

---

### Method 2: Instant GitHub Push Webhook (100% Zero-Touch)

With this method, **the moment you push or merge code to `main` on GitHub, GitHub automatically notifies your server**, and the server downloads the updates and restarts itself instantly—without you even opening your hosting panel.

#### Step 1: Get your Webhook URL
Your server webhook URL format is:
```text
http://YOUR-SERVER-IP-OR-DOMAIN:PORT/api/webhook/github
```
*(You can also find this pre-filled in your **Admin Dashboard > GitHub Auto-Deployment** section).*

#### Step 2: Add Webhook in GitHub
1. Go to your GitHub repository:  
   👉 [https://github.com/muhebrewwinston-sudo/Muhebrew-library-/settings/hooks](https://github.com/muhebrewwinston-sudo/Muhebrew-library-/settings/hooks)
2. Click the green **Add webhook** button.
3. Configure the fields:
   - **Payload URL**: `http://YOUR-SERVER-IP-OR-DOMAIN:PORT/api/webhook/github`
   - **Content type**: Select `application/json`
   - **Secret**: (Optional, leave blank or enter a secret matching `WEBHOOK_SECRET` in your `.env`)
   - **Which events would you like to trigger this webhook?**: Select **Just the push event**.
   - Check **Active**.
4. Click **Add webhook**.

GitHub will immediately send a test ping. Your server will respond with:
`"Ping event received! GitHub Webhook is successfully connected to Muhebrew Library."`

Now, whenever any backend or frontend change is pushed to `main`, GitHub automatically deploys it to your server!

---

### Method 3: 1-Click "Sync from GitHub" inside Admin Dashboard

If you are browsing your library from your phone or computer and want to force an update immediately:

1. Sign in with your owner account: `muhebrewwinston@gmail.com`.
2. Go to the **Admin Dashboard** (`/admin.html`).
3. Under the **GitHub Auto-Deployment & X Systems Server Sync** card:
   - Check your current commit and update status.
   - Click the green **Sync from GitHub Now** button.
4. A terminal window will open showing real-time `git fetch`, `git reset`, and dependency verification logs.
5. Click **Reload Page** to see your updates live!

---

## 🛠️ Summary of Files Created

| File | Purpose |
|---|---|
| `startup.sh` | Auto-updating launch script for Pterodactyl / X Systems |
| `backend/services/autoUpdater.js` | Core background updater service, Git pull runner, and signature verifier |
| `backend/routes/webhook.js` | HTTP endpoint (`/api/webhook/github`) receiving GitHub push events |
| `.github/workflows/deploy.yml` | GitHub Actions workflow to trigger deployment on every push |
| `frontend/admin.html` & `frontend/js/admin.js` | Interactive admin controls to check commit status and trigger 1-click sync |

---

## ❓ Frequently Asked Questions

**Q: Will updating delete my SQLite database (`pasthub.db`) or uploaded files?**  
**A:** No. `backend/db/*.db` and `uploads/` are preserved and ignored by Git resets, so all your users, uploaded past papers, and quotas remain completely safe during auto-updates.

**Q: What if I uploaded my project initially without Git?**  
**A:** The `startup.sh` script and `autoUpdater.js` automatically detect if `.git` is missing, initialize Git, connect to `https://github.com/muhebrewwinston-sudo/Muhebrew-library-.git`, and sync with `origin/main` automatically.

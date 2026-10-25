# Muhebrew Library

Download Malawi secondary school resources. A complete website (frontend + backend) for past papers and textbooks, Form 1 to Form 4. Runs on Linux, Pterodactyl hosts (like X Systems Hosting), Termux (Android), Mac, or Windows with **Node.js 18 or newer**.

## Features
- Green "Muhebrew Library" mobile-first design with dark mode, built for phones
- Search and filter by level, subject and year; sort by newest, most downloaded, A-Z
- PDF preview pop-up, download counter, save list, "report broken file" button
- Sign in / create account (student or teacher), 30-day login
- Admin dashboard: upload papers and books, review teacher uploads, handle reports, manage users and roles
- Teacher upload page: uploads wait for admin approval before they show on the site

## Folder map
| Path | What it is |
|---|---|
| `server.js` | Starts the website and API server |
| `routes/` | Backend route controllers (auth, papers, books, search, admin) |
| `middleware/` | JWT auth checks and file upload rules |
| `db/` | Database driver, schema, setup, seed and admin tools |
| `backend/` | Backend Node.js API server, database, uploads, and services |
| `frontend/` | The web client (HTML, CSS, JavaScript) |
| `startup.sh` | Auto-updating startup script for X Systems Hosting / Pterodactyl |
| `uploads/` | Uploaded PDFs and covers (created automatically) |

## Hosting on X Systems Hosting / Pterodactyl (Auto-Updated from GitHub)
1. In the **Startup** tab in your X Systems Hosting Panel:
   - Set the startup command to:
     ```bash
     bash startup.sh
     ```
     *(This automatically checks GitHub on every boot and updates your backend without manual file uploads).*
   - The server automatically detects Pterodactyl's allocated port (`SERVER_PORT` or `PORT`) and binds to `0.0.0.0`.
   - The server automatically creates a secure `.env` file with `JWT_SECRET` and `WEBHOOK_SECRET` if one does not exist.
2. (Optional for Instant Zero-Touch Auto-Deploy): Add a GitHub Webhook in your repo settings (`https://github.com/muhebrewwinston-sudo/Muhebrew-library-/settings/hooks`) pointing to `http://YOUR-SERVER:PORT/api/webhook/github`. Whenever code is pushed to `main`, GitHub tells your server to pull and restart automatically!
3. For full details and 1-click admin sync, see [XSYSTEMS_AUTO_UPDATE.md](./XSYSTEMS_AUTO_UPDATE.md).
4. Run `npm install` in the Console tab if needed.
5. Click **Start**.

## Local / Termux Setup
```bash
npm install
npm run setup                                      # creates .env with a secret key
npm run seed -- your@email.com YourPassword123     # creates YOUR admin account
npm start
```
Open `http://localhost:3000` in your browser.

Optional: `npm run seed:samples` adds 6 small sample PDFs so you can test preview and download.
Delete them in Admin > Recent uploads before you share the site.

## Everyday commands
```bash
npm start                                          # run the site
npm run admin -- list-users                        # see all accounts
npm run admin -- make-admin you@email.com          # give admin rights
npm run admin -- make-teacher teacher@email.com    # give teacher rights
npm run admin -- set-password you@email.com NewPass123
npm run admin -- set-email old@email.com new@email.com
```

## Settings in `.env`
- `PORT` or `SERVER_PORT`: Port to listen on (defaults to 3000)
- `JWT_SECRET`: Secret key for signing login tokens (auto-generated if missing)
- `JWT_EXPIRES`: Login token duration (default: `30d`)
- `DB_PATH`: Location of SQLite database file (default: `./db/pasthub.db`)
- `MAX_UPLOAD_MB`: Maximum file upload size in MB (default: `40`)

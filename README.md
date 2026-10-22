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
| `public/` | The frontend (pages, CSS, JavaScript) |
| `uploads/` | Uploaded PDFs and covers (created automatically) |

## Hosting on X Systems Hosting / Pterodactyl
1. Upload the project files to your server directory.
2. In the Startup / Settings tab:
   - Make sure the startup command is `npm start` (or `node server.js`).
   - The server automatically detects Pterodactyl's allocated port (`SERVER_PORT` or `PORT`) and binds to `0.0.0.0`.
   - The server automatically creates a secure `.env` file with `JWT_SECRET` if one does not exist.
3. Run `npm install` in the Console tab.
4. (Optional) Run `npm run seed -- admin@email.com AdminPassword123` to create your initial admin account.
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

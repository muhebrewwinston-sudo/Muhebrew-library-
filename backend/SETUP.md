# Muhebrew Library – Drime as file server

## How it works (your requirement)

1. **Student searches** on the website  
2. **Request goes to your server**  
3. **Server looks up** papers/books in the database  
4. **Server gets the file from Drime** (cloud storage) and sends it to the student  
5. Student **downloads on your website** – no need to open Drime

Files can be:
- Uploaded on the website (saved to Drime + listed in DB), or  
- Uploaded **only on Drime**, then Admin runs **Sync from Drime** so they appear in search

## Admin: Sync files uploaded only on Drime

POST `/api/admin/sync-from-drime`  
Body (optional): `{ "type": "paper" }` or `"book"` or `"marking"`

Or list cloud files: GET `/api/admin/drime-files`

## Environment

DRIME_API_KEY=...
DRIME_FOLDER_ID=...
DRIME_FOLDER_URL=https://dri.me/...
DRIME_API_BASE=https://app.drime.com/api/v1
DRIME_FOLDER_PAPERS=
DRIME_FOLDER_BOOKS=
DRIME_FOLDER_MARKING=

SMTP_... (for email verification)

## Downloads (many users, no page redirect)

1. Student clicks Download — stays on the website
2. Server checks login + quota
3. If Drime has a direct file URL → client fetches it (less load on your server)
4. Otherwise server streams the file
5. Browser saves via JavaScript blob — no redirect to dri.me

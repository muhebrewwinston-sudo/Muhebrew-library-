# Muhebrew Library – Backend Server

Modular backend services for Muhebrew Library (Malawi Secondary School Past Papers & Textbooks Platform).

## Features
- **Express & SQLite Architecture**: High-speed, zero-config relational storage.
- **Drime Cloud Storage Sync**: Direct upload, cloud list, and streaming downloads without external redirects.
- **Auto-Trace Engine**: Intelligent parsing of Malawi curriculum documents (Form 1–4, MANEB, Mocks, Marking Keys, Textbooks).
- **Bulk Upload & ZIP Ingestion**: Unzips multi-file archives, auto-detects subjects and levels, and indexes into library.
- **Download Quota System**: Contribution-gated unlocking (+5 downloads per contribution).

## Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Setup database and initial environment
npm run setup

# 3. Seed sample data and admin account
npm run seed:samples -- muhebrewwinston@gmail.com Winston123

# 4. Start the server
npm start
```
Default server runs on `http://0.0.0.0:3000`.

## API Endpoints
- `GET /api/papers`: Filter and browse past exam papers.
- `GET /api/books`: Filter and browse curriculum textbooks.
- `POST /api/papers`: Submit a paper (auto-approved and synced to Drime).
- `POST /api/books`: Submit a book.
- `GET /api/papers/:id/download`: Real-time streaming download with quota deduction.
- `POST /api/admin/bulk-upload`: Upload a ZIP file containing multiple PDFs.
- `POST /api/admin/sync-from-drime`: Index files uploaded directly to Drime Cloud folder.
- `GET /api/admin/drime-files`: View remote Drime files.

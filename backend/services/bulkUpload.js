const { autoTraceFile } = require('../utils/autotrace');
/**
 * Bulk ZIP Upload
 * Filename pattern: Subject_Level_Year_Title.pdf
 * Examples:
 *   Chemistry_Form3_2024_Paper1.pdf
 *   Biology_Form4_2023_MarkingKey.pdf
 *   Mathematics_Form1_2022_Textbook.pdf
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../db/database');
const drimeService = require('./drime');

const SUBJECTS = [
  'mathematics', 'math', 'maths', 'biology', 'chemistry', 'physics',
  'agriculture', 'english', 'chichewa', 'geography', 'history',
  'bible', 'computer', 'business', 'commerce', 'accounting',
  'life', 'social', 'home'
];

const LEVEL_MAP = {
  form1: 'Form 1', form2: 'Form 2', form3: 'Form 3', form4: 'Form 4',
  'form 1': 'Form 1', 'form 2': 'Form 2', 'form 3': 'Form 3', 'form 4': 'Form 4',
  jce: 'Form 1', msce: 'Form 4', f1: 'Form 1', f2: 'Form 2', f3: 'Form 3', f4: 'Form 4'
};

function parseFilename(filename) {
  const t = autoTraceFile(filename || 'file.pdf', 0);
  return {
    title: t.title,
    subject: t.subject,
    level: t.level || '',
    year: t.year,
    category: t.category || 'Past Paper',
    type: t.type === 'books' ? 'book' : 'paper',
    exam_board: t.exam_board || null,
    school: t.school || null,
    paper_no: t.paper_no || null,
    originalName: filename
  };
}


function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  try {
    execSync('unzip -o -j ' + JSON.stringify(zipPath) + ' -d ' + JSON.stringify(destDir), {
      stdio: 'pipe',
      timeout: 120000
    });
    return true;
  } catch (e1) {
    try {
      const py = 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2])';
      execSync('python3 -c ' + JSON.stringify(py) + ' ' + JSON.stringify(zipPath) + ' ' + JSON.stringify(destDir), {
        stdio: 'pipe',
        timeout: 120000
      });
      return true;
    } catch (e2) {
      console.error('[BulkUpload] Extract failed:', e1.message, e2 && e2.message);
      return false;
    }
  }
}

async function processBulkZip({ zipPath, uploadedBy, defaultStatus = 'approved' }) {
  const workDir = path.join(path.dirname(zipPath), 'bulk_' + Date.now());
  const results = { success: [], failed: [], skipped: [] };

  try {
    if (!extractZip(zipPath, workDir)) {
      return { ok: false, error: 'Could not extract ZIP file. Make sure it is a valid .zip containing PDFs.' };
    }

    const files = [];
    function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(pdf|doc|docx)$/i.test(name)) files.push(full);
      }
    }
    walk(workDir);

    if (files.length === 0) {
      return { ok: false, error: 'No PDF/DOC files found inside the ZIP.' };
    }

    for (const filePath of files) {
      const originalName = path.basename(filePath);
      try {
        const meta = parseFilename(originalName);
        const table = meta.type === 'book' ? 'books' : 'papers';
        const isBook = meta.type === 'book';

        // Skip exact duplicate title
        const dup = db.prepare('SELECT id, title FROM ' + table + ' WHERE LOWER(title) = ?').get(meta.title.toLowerCase());
        if (dup) {
          results.skipped.push({ file: originalName, reason: 'Already exists: ' + dup.title });
          continue;
        }

        // Copy to uploads folder
        const bucket = isBook ? 'books' : 'papers';
        const destName = Date.now() + '-' + Math.round(Math.random() * 1e6) + '-' + originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
        const destDir = path.join(__dirname, '..', 'uploads', bucket);
        fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, destName);
        fs.copyFileSync(filePath, destPath);

        const relPath = path.join('uploads', bucket, destName).replace(/\\/g, '/');
        const fileSize = fs.statSync(destPath).size;
        const mime = originalName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

        // Upload to Drime
        let storageProvider = 'drime';
        let drimeFileId = null;
        let drimeUrl = null;
        let drimeFolderId = null;
        try {
          const folderId = drimeService.getFolderIdForType
            ? drimeService.getFolderIdForType(meta.type === 'book' ? 'book' : (meta.category === 'Marking Key' ? 'marking' : 'paper'), meta.category)
            : drimeService.DRIME_FOLDER_ID;
          const drimeRes = await drimeService.uploadToDrime({
            filePath: destPath,
            originalName,
            mimeType: mime,
            folderId,
            category: meta.category,
            subject: meta.subject,
            level: meta.level
          });
          drimeFileId = drimeRes.fileId;
          drimeUrl = drimeRes.url || drimeService.DRIME_FOLDER_URL;
          drimeFolderId = drimeRes.folderId || drimeService.DRIME_FOLDER_ID;
        } catch (e) {
          console.error('[BulkUpload] Drime error for', originalName, e.message);
          storageProvider = 'local';
        }

        const storedPath = relPath; // always local path so downloads work on website

        if (isBook) {
          db.prepare(`
            INSERT INTO books (title, author, subject, level, category, description, file_path, file_name, file_size, mime_type,
              storage_provider, drime_file_id, drime_url, drime_folder_id, uploaded_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            meta.title, null, meta.subject, meta.level, meta.category, null,
            storedPath, originalName, fileSize, mime,
            storageProvider, drimeFileId, drimeUrl, drimeFolderId,
            uploadedBy || null, defaultStatus
          );
        } else {
          db.prepare(`
            INSERT INTO papers (title, subject, level, category, year, exam_board, description, file_path, file_name, file_size, mime_type,
              storage_provider, drime_file_id, drime_url, drime_folder_id, uploaded_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            meta.title, meta.subject, meta.level || null, meta.category, meta.year, meta.exam_board || null, meta.school ? ("School: " + meta.school) : null,
            storedPath, originalName, fileSize, mime,
            storageProvider, drimeFileId, drimeUrl, drimeFolderId,
            uploadedBy || null, defaultStatus
          );
        }

        results.success.push({
          file: originalName,
          title: meta.title,
          subject: meta.subject,
          level: meta.level,
          year: meta.year,
          type: meta.type,
          category: meta.category
        });
      } catch (err) {
        results.failed.push({ file: originalName, reason: err.message });
      }
    }

    return {
      ok: true,
      total: files.length,
      uploaded: results.success.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
      details: results
    };
  } finally {
    // Cleanup temp extract folder
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (_) {}
    try {
      fs.unlinkSync(zipPath);
    } catch (_) {}
  }
}

module.exports = { parseFilename, processBulkZip };

/**
 * Drime Cloud = primary file storage for Muhebrew Library
 * Website server talks to Drime API: list, upload, download/stream, and sync
 */
const fs = require('fs');
const path = require('path');
const { autoTraceFile } = require('../utils/autotrace');

const DRIME_API_KEY = process.env.DRIME_API_KEY || '';
const DRIME_FOLDER_ID = process.env.DRIME_FOLDER_ID || 'BiWwc46CM0eJ0yzuDOJu5jxg1L8yfw';
const DRIME_FOLDER_URL = process.env.DRIME_FOLDER_URL || 'https://dri.me/BiWwc46CM0eJ0yzuDOJu5jxg1L8yfw';
const DRIME_API_BASE = (process.env.DRIME_API_BASE || 'https://app.drime.com/api/v1').replace(/\/$/, '');

const FOLDER_MAP = {
  paper: process.env.DRIME_FOLDER_PAPERS || DRIME_FOLDER_ID,
  book: process.env.DRIME_FOLDER_BOOKS || DRIME_FOLDER_ID,
  marking: process.env.DRIME_FOLDER_MARKING || DRIME_FOLDER_ID,
  notes: process.env.DRIME_FOLDER_NOTES || DRIME_FOLDER_ID
};

function authHeaders() {
  const headers = { Accept: 'application/json' };
  if (DRIME_API_KEY) {
    headers.Authorization = `Bearer ${DRIME_API_KEY}`;
  }
  return headers;
}

function getFolderIdForType(type, category = '') {
  const t = String(type || 'paper').toLowerCase();
  const c = String(category || '').toLowerCase();
  if (t.includes('mark') || c.includes('mark') || c.includes('scheme') || c.includes('key')) {
    return FOLDER_MAP.marking;
  }
  if (t.includes('book') || t.includes('text')) return FOLDER_MAP.book;
  if (t.includes('note') || c.includes('note')) return FOLDER_MAP.notes;
  return FOLDER_MAP.paper;
}

function getStatus() {
  return {
    enabled: true,
    provider: 'drime',
    name: 'Drime Cloud Storage',
    folderId: DRIME_FOLDER_ID,
    folderUrl: DRIME_FOLDER_URL,
    folders: FOLDER_MAP,
    hasApiKey: Boolean(DRIME_API_KEY),
    status: DRIME_API_KEY ? 'configured' : 'folder_connected'
  };
}

/**
 * Decode common HTML entities from scraped pages
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Parse files from HTML page (Drime Inertia / script payloads)
 */
function extractFilesInHtml(html, folderId) {
  const files = [];
  try {
    const inertiaMatch = html.match(/data-page="([^"]+)"/i);
    if (inertiaMatch) {
      const decoded = decodeHtmlEntities(inertiaMatch[1]);
      const data = JSON.parse(decoded);
      const entries = data?.props?.link?.entry?.children
        || data?.props?.entries
        || data?.props?.folder?.entries
        || data?.props?.files
        || [];
      if (Array.isArray(entries)) {
        for (const e of entries) {
          if (e.type === 'folder') continue;
          files.push({
            id: String(e.id || e.hash || ''),
            name: e.name || e.file_name || 'document.pdf',
            size: Number(e.file_size || e.size || 0),
            mime: e.mime || e.mime_type || 'application/pdf',
            url: e.url || (e.hash ? `https://dri.me/${e.hash}` : `https://dri.me/${folderId}/${e.id}`),
            folderId
          });
        }
      }
    }
  } catch (_) {}

  try {
    const jsonMatch = html.match(/window\.(?:bootstrapData|__INITIAL_STATE__|drimeData)\s*=\s*(\{.*?\});/s);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      const entries = data.entries || data.files || [];
      if (Array.isArray(entries)) {
        for (const e of entries) {
          if (e.type === 'folder') continue;
          files.push({
            id: String(e.id || ''),
            name: e.name || 'document.pdf',
            size: Number(e.size || 0),
            mime: e.mime || 'application/pdf',
            url: e.url || `https://dri.me/${folderId}/${e.id}`,
            folderId
          });
        }
      }
    }
  } catch (_) {}

  return files;
}

/**
 * List files in a Drime folder (for sync / browse)
 */
async function listFiles(folderId) {
  const fid = folderId || DRIME_FOLDER_ID;

  // 1. Try authenticated API endpoints if key is present
  if (DRIME_API_KEY) {
    const endpoints = [
      `${DRIME_API_BASE}/folders/${fid}/files`,
      `${DRIME_API_BASE}/files?folder_id=${encodeURIComponent(fid)}`,
      `${DRIME_API_BASE}/files?parent_id=${encodeURIComponent(fid)}`,
      `${DRIME_API_BASE}/entries?folder_id=${encodeURIComponent(fid)}`,
      `${DRIME_API_BASE}/shares/${encodeURIComponent(fid)}/entries`,
      `${DRIME_API_BASE}/shares/${encodeURIComponent(fid)}`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) continue;
        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : data.files || data.data || data.items || data.entries || [];
        if (!Array.isArray(list) || list.length === 0) continue;
        return {
          ok: true,
          files: list.map((f) => ({
            id: String(f.id || f.file_id || f.uuid || ''),
            name: f.name || f.filename || f.title || f.original_name || 'file.pdf',
            size: Number(f.size || f.bytes || 0),
            mime: f.mime || f.mime_type || f.content_type || 'application/pdf',
            url: f.url || f.download_url || f.link || null,
            folderId: fid
          })).filter((f) => f.id || f.name)
        };
      } catch (e) {
        // Continue to next endpoint
      }
    }
  }

  // 2. Try public folder page / public share endpoint
  const publicUrls = [
    `https://dri.me/${encodeURIComponent(fid)}`,
    `${DRIME_API_BASE}/shares/${encodeURIComponent(fid)}`,
    `${DRIME_API_BASE}/shareable-links/${encodeURIComponent(fid)}`
  ];

  for (const pUrl of publicUrls) {
    try {
      const res = await fetch(pUrl, { headers: { Accept: 'text/html,application/json' } });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : data.files || data.entries || data.data || (data.link && data.link.entry && data.link.entry.children) || [];
        if (Array.isArray(list) && list.length > 0) {
          return {
            ok: true,
            files: list.map((f) => ({
              id: String(f.id || f.hash || ''),
              name: f.name || 'document.pdf',
              size: Number(f.size || 0),
              mime: f.mime || 'application/pdf',
              url: f.url || `https://dri.me/${fid}/${f.id}`,
              folderId: fid
            }))
          };
        }
      } else {
        const html = await res.text();
        const parsed = extractFilesInHtml(html, fid);
        if (parsed.length > 0) {
          return { ok: true, files: parsed };
        }
      }
    } catch (_) {
      // Continue
    }
  }

  return {
    ok: false,
    files: [],
    error: 'No files currently retrieved from Drime folder'
  };
}

/**
 * Get a direct download URL or stream buffer from Drime for a file id or URL
 */
async function downloadFile(fileIdOrUrl) {
  if (!fileIdOrUrl) return { ok: false, error: 'Missing file id or url' };

  // If a full URL was provided
  if (String(fileIdOrUrl).startsWith('http://') || String(fileIdOrUrl).startsWith('https://')) {
    try {
      const res = await fetch(fileIdOrUrl, {
        headers: DRIME_API_KEY ? authHeaders() : { Accept: '*/*' },
        redirect: 'follow'
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 50) {
          return {
            ok: true,
            buffer: buf,
            contentType: res.headers.get('content-type') || 'application/pdf'
          };
        }
      }
    } catch (e) {
      console.warn('[Drime] Direct URL download failed:', e.message);
    }
  }

  const cleanId = String(fileIdOrUrl).replace(/^drime:\/\//, '');

  const endpoints = [
    `${DRIME_API_BASE}/files/${cleanId}/download`,
    `${DRIME_API_BASE}/files/${cleanId}/content`,
    `${DRIME_API_BASE}/downloads/${cleanId}`,
    `${DRIME_API_BASE}/files/${cleanId}`,
    `https://dri.me/d/${cleanId}`,
    `https://dri.me/${cleanId}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: DRIME_API_KEY ? { ...authHeaders() } : { Accept: '*/*' },
        redirect: 'follow'
      });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      // JSON metadata with download url inside
      if (ct.includes('application/json')) {
        const data = await res.json();
        const direct = data.url || data.download_url || data.link || (data.file && data.file.url);
        if (direct) {
          const fileRes = await fetch(direct, { redirect: 'follow' });
          if (fileRes.ok) {
            const buf = Buffer.from(await fileRes.arrayBuffer());
            return {
              ok: true,
              buffer: buf,
              contentType: fileRes.headers.get('content-type') || 'application/pdf'
            };
          }
        }
        continue;
      }
      // Binary body
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100) {
        return {
          ok: true,
          buffer: buf,
          contentType: res.headers.get('content-type') || 'application/pdf'
        };
      }
    } catch (e) {
      // Continue to next endpoint
    }
  }

  return { ok: false, error: 'Could not download file from Drime' };
}

/**
 * Upload a file to Drime Cloud Storage
 */
async function uploadToDrime({ filePath, originalName, mimeType, folderId, category, subject, level }) {
  const isMarking = (category || '').toLowerCase().includes('mark') || (originalName || '').toLowerCase().includes('mark');
  const targetFolder = folderId || (isMarking ? FOLDER_MAP.marking : DRIME_FOLDER_ID);
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found at ${absPath}`);
  }

  const fileSize = fs.statSync(absPath).size;
  const fileHash = `drime_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  if (!DRIME_API_KEY) {
    return {
      success: true,
      provider: 'drime',
      fileId: fileHash,
      url: DRIME_FOLDER_URL,
      folderId: targetFolder,
      synced: false,
      size: fileSize
    };
  }

  try {
    const fileBuffer = fs.readFileSync(absPath);
    const blob = new Blob([fileBuffer], { type: mimeType || 'application/pdf' });
    const formData = new FormData();
    formData.append('file', blob, originalName || path.basename(absPath));
    formData.append('parent_id', targetFolder);
    formData.append('folder_id', targetFolder);
    if (category) formData.append('category', category);
    if (subject) formData.append('subject', subject);
    if (level) formData.append('level', level);
    const folderGroup = isMarking ? 'Marking Keys' : (category || 'Past Papers');
    formData.append('path', `${folderGroup}/${subject || 'General'}/${level || 'Form 4'}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${DRIME_API_BASE}/uploads`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const drimeFileId = String(data.id || (data.file && data.file.id) || fileHash);
      const drimeUrl = data.url || (data.file && data.file.url) || DRIME_FOLDER_URL;
      console.log(`[Drime Cloud Storage] Upload successful: ${originalName} -> ${drimeFileId}`);
      return {
        success: true,
        provider: 'drime',
        fileId: drimeFileId,
        url: drimeUrl,
        folderId: targetFolder,
        synced: true,
        size: fileSize
      };
    }
    console.log('[Drime Cloud Storage] Upload status:', response.status);
  } catch (err) {
    console.log('[Drime Cloud Storage] Upload error:', err.message);
  }

  return {
    success: true,
    provider: 'drime',
    fileId: fileHash,
    url: DRIME_FOLDER_URL,
    folderId: targetFolder,
    synced: false,
    size: fileSize
  };
}

/**
 * Automatically scan Drime folder and sync files to the database
 * Creates or updates records in papers/books tables
 */
async function syncDrimeFilesToDatabase(db) {
  if (!db) return { ok: false, error: 'Database instance required' };

  try {
    const listRes = await listFiles(DRIME_FOLDER_ID);
    if (!listRes.ok || !Array.isArray(listRes.files) || listRes.files.length === 0) {
      return {
        ok: false,
        message: listRes.error || 'No files returned from Drime folder',
        folderId: DRIME_FOLDER_ID,
        folderUrl: DRIME_FOLDER_URL,
        imported: 0,
        updated: 0,
        total: 0
      };
    }

    let importedCount = 0;
    let updatedCount = 0;
    const syncedList = [];

    for (const f of listRes.files) {
      const fileName = f.name || 'document.pdf';
      const fileSize = Number(f.size) || 1024;
      const fileId = String(f.id || `drime_${Date.now()}`);
      const fileUrl = f.url || `${DRIME_FOLDER_URL}/${encodeURIComponent(fileId)}`;

      const traced = autoTraceFile(fileName, fileSize);
      const isBook = traced.type === 'books';
      const table = isBook ? 'books' : 'papers';

      // Clean title - eliminate redundant form labels at end
      const cleanTitle = (traced.title || fileName.replace(/\.[^/.]+$/, ''))
        .replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '')
        .replace(/\s+Form\s*[1-4]\s*$/i, '')
        .trim();

      // Check if item already exists by drime_file_id or file_name
      const existing = db.prepare(
        `SELECT id, title FROM ${table} WHERE drime_file_id = ? OR (file_name = ? AND storage_provider = 'drime')`
      ).get(fileId, fileName);

      if (existing) {
        db.prepare(`
          UPDATE ${table} SET
            drime_file_id = ?,
            drime_url = ?,
            drime_folder_id = ?,
            file_size = ?,
            status = 'approved'
          WHERE id = ?
        `).run(fileId, fileUrl, f.folderId || DRIME_FOLDER_ID, fileSize, existing.id);
        updatedCount++;
        syncedList.push({ id: existing.id, title: cleanTitle, action: 'updated' });
      } else {
        const defaultCategory = isBook ? 'MSCE' : (traced.category || 'MANEB');
        if (isBook) {
          db.prepare(`
            INSERT INTO books (
              title, subject, level, category, author, description,
              file_path, file_name, file_size, mime_type,
              storage_provider, drime_file_id, drime_url, drime_folder_id,
              status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'drime', ?, ?, ?, 'approved')
          `).run(
            cleanTitle,
            traced.subject || 'General Studies',
            traced.level || 'Form 4',
            defaultCategory,
            traced.author || 'Ministry of Education',
            traced.description || 'Imported automatically from Drime Cloud Storage',
            'drime://' + fileId,
            fileName,
            fileSize,
            f.mime || 'application/pdf',
            fileId,
            fileUrl,
            f.folderId || DRIME_FOLDER_ID
          );
        } else {
          db.prepare(`
            INSERT INTO papers (
              title, subject, level, category, year, exam_board, description,
              file_path, file_name, file_size, mime_type,
              storage_provider, drime_file_id, drime_url, drime_folder_id,
              status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'drime', ?, ?, ?, 'approved')
          `).run(
            cleanTitle,
            traced.subject || 'General Studies',
            traced.level || 'Form 4',
            defaultCategory,
            traced.year || new Date().getFullYear(),
            traced.exam_board || (defaultCategory === 'Cluster Mock' ? 'Cluster Mock' : 'MANEB'),
            traced.description || 'Imported automatically from Drime Cloud Storage',
            'drime://' + fileId,
            fileName,
            fileSize,
            f.mime || 'application/pdf',
            fileId,
            fileUrl,
            f.folderId || DRIME_FOLDER_ID
          );
        }
        importedCount++;
        syncedList.push({ title: cleanTitle, action: 'imported' });
      }
    }

    console.log(`[Drime Auto-Sync] Synced ${importedCount} new, ${updatedCount} updated (${listRes.files.length} total in Drime)`);
    return {
      ok: true,
      imported: importedCount,
      updated: updatedCount,
      total: listRes.files.length,
      folderId: DRIME_FOLDER_ID,
      files: syncedList
    };
  } catch (err) {
    console.error('[Drime Auto-Sync] Error during sync:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  DRIME_API_KEY,
  DRIME_FOLDER_ID,
  DRIME_FOLDER_URL,
  DRIME_API_BASE,
  getStatus,
  getFolderIdForType,
  listFiles,
  downloadFile,
  uploadToDrime,
  syncDrimeFilesToDatabase
};

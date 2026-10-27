/**
 * Drime Cloud = primary file storage for Muhebrew Library
 * Website server communicates with Drime Cloud API (https://app.drime.cloud/api/v1):
 * Auto-locates the "Muhebrew" folder, scans all subfolders/files, and syncs them directly to the website library.
 */
const fs = require('fs');
const path = require('path');
const { autoTraceFile } = require('../utils/autotrace');

// Default API base provided by user: https://app.drime.cloud/api/v1
const DRIME_API_BASE = (process.env.DRIME_API_BASE || 'https://app.drime.cloud/api/v1').replace(/\/$/, '');
const DRIME_API_KEY = process.env.DRIME_API_KEY || '75742|BShm3EM0mJPNumW9qZphDpHCCkJK1koYZb3HBMFA0aedf331';
const DRIME_FOLDER_NAME = process.env.DRIME_FOLDER_NAME || 'Muhebrew';
const DRIME_FOLDER_ID = process.env.DRIME_FOLDER_ID || 'BiWwc46CM0eJ0yzuDOJu5jxg1L8yfw';
const DRIME_FOLDER_URL = process.env.DRIME_FOLDER_URL || 'https://dri.me/BiWwc46CM0eJ0yzuDOJu5jxg1L8yfw';

// Fallback API hosts if needed
const API_BASES = [
  DRIME_API_BASE,
  'https://app.drime.cloud/api/v1',
  'https://app.drime.com/api/v1'
].filter((v, i, a) => a.indexOf(v) === i);

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
    apiBase: DRIME_API_BASE,
    folderName: DRIME_FOLDER_NAME,
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
          if (e.type === 'folder' || e.is_dir) continue;
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
          if (e.type === 'folder' || e.is_dir) continue;
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
 * Locate the "Muhebrew" folder inside Drime Cloud Storage
 */
async function locateMuhebrewFolder() {
  if (!DRIME_API_KEY) {
    return { id: DRIME_FOLDER_ID, name: DRIME_FOLDER_NAME, source: 'fallback' };
  }

  const folderKeywords = ['muhebrew', 'library'];

  for (const base of API_BASES) {
    const folderEndpoints = [
      `${base}/folders`,
      `${base}/file-entries?type=folder&per_page=100`,
      `${base}/drive/file-entries?type=folder&per_page=100`,
      `${base}/file-entries?query=muhebrew`,
      `${base}/search?query=muhebrew`
    ];

    for (const url of folderEndpoints) {
      try {
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) continue;
        const data = await res.json();
        const items = Array.isArray(data)
          ? data
          : data.data || data.folders || data.entries || data.items || [];
        if (!Array.isArray(items)) continue;

        const match = items.find((f) => {
          const name = String(f.name || f.title || '').toLowerCase();
          return folderKeywords.some((kw) => name.includes(kw));
        });

        if (match) {
          const fid = String(match.id || match.hash || match.uuid || '');
          const fname = match.name || match.title || DRIME_FOLDER_NAME;
          console.log(`[Drime Cloud API] Located Muhebrew folder: "${fname}" (ID: ${fid})`);
          return { id: fid, name: fname, hash: match.hash, source: 'api' };
        }
      } catch (_) {}
    }

    // Try configured DRIME_FOLDER_ID directly
    try {
      const res = await fetch(`${base}/folders/${encodeURIComponent(DRIME_FOLDER_ID)}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const f = data.folder || data.data || data;
        return {
          id: String(f.id || DRIME_FOLDER_ID),
          name: f.name || DRIME_FOLDER_NAME,
          source: 'configured_id'
        };
      }
    } catch (_) {}
  }

  return { id: DRIME_FOLDER_ID, name: DRIME_FOLDER_NAME, source: 'default' };
}

/**
 * Recursively list all files under the Muhebrew folder in Drime Cloud Storage
 */
async function listFilesUnderMuhebrew(rootFolderId, rootFolderName = 'Muhebrew') {
  const visitedFolders = new Set();
  const folderQueue = [{ id: rootFolderId, path: rootFolderName }];
  const allFiles = [];
  const seenFileIds = new Set();

  while (folderQueue.length > 0) {
    const current = folderQueue.shift();
    const fid = current.id;
    if (!fid || visitedFolders.has(String(fid))) continue;
    visitedFolders.add(String(fid));

    let folderEntries = [];

    // Query API endpoints across bases
    for (const base of API_BASES) {
      if (!DRIME_API_KEY) break;
      const endpoints = [
        `${base}/folders/${encodeURIComponent(fid)}/files`,
        `${base}/folders/${encodeURIComponent(fid)}/entries`,
        `${base}/folders/${encodeURIComponent(fid)}`,
        `${base}/file-entries?parent_id=${encodeURIComponent(fid)}&per_page=150`,
        `${base}/drive/file-entries?parent_id=${encodeURIComponent(fid)}&per_page=150`,
        `${base}/entries?folder_id=${encodeURIComponent(fid)}`,
        `${base}/shares/${encodeURIComponent(fid)}/entries`,
        `${base}/shares/${encodeURIComponent(fid)}`
      ];

      for (const url of endpoints) {
        try {
          const res = await fetch(url, { headers: authHeaders() });
          if (!res.ok) continue;
          const data = await res.json();
          const list = Array.isArray(data)
            ? data
            : data.files || data.entries || data.data || (data.folder && (data.folder.entries || data.folder.children)) || (data.link && data.link.entry && data.link.entry.children) || [];
          if (Array.isArray(list) && list.length > 0) {
            folderEntries = list;
            break;
          }
        } catch (_) {}
      }
      if (folderEntries.length > 0) break;
    }

    // Fallback: public share page scraping if root folder
    if (folderEntries.length === 0 && fid === rootFolderId) {
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
              folderEntries = list;
              break;
            }
          } else {
            const html = await res.text();
            const parsed = extractFilesInHtml(html, fid);
            if (parsed.length > 0) {
              folderEntries = parsed;
              break;
            }
          }
        } catch (_) {}
      }
    }

    // Process entries in current folder
    for (const item of folderEntries) {
      const isFolder = item.type === 'folder' || item.is_dir || item.mime === 'directory' || item.mime_type === 'directory';
      if (isFolder) {
        const subId = String(item.id || item.hash || '');
        const subName = item.name || item.title || 'subfolder';
        if (subId && !visitedFolders.has(subId)) {
          folderQueue.push({ id: subId, path: `${current.path}/${subName}` });
        }
      } else {
        const fileId = String(item.id || item.hash || item.file_id || item.uuid || '');
        const fileName = item.name || item.filename || item.title || item.original_name || 'document.pdf';
        const key = fileId || fileName;
        if (!seenFileIds.has(key)) {
          seenFileIds.add(key);
          allFiles.push({
            id: fileId || `drime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: fileName,
            size: Number(item.file_size || item.size || item.bytes || 0),
            mime: item.mime || item.mime_type || item.content_type || 'application/pdf',
            url: item.url || item.download_url || item.link || (item.hash ? `https://dri.me/${item.hash}` : null),
            folderId: fid,
            folderPath: current.path
          });
        }
      }
    }
  }

  // Fallback: check if file-entries returns files whose path includes "muhebrew"
  if (allFiles.length === 0 && DRIME_API_KEY) {
    for (const base of API_BASES) {
      try {
        const res = await fetch(`${base}/file-entries?per_page=200`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.data || data.entries || [];
          if (Array.isArray(list)) {
            for (const f of list) {
              const isFolder = f.type === 'folder' || f.is_dir;
              if (isFolder) continue;
              const fPath = String(f.path || f.parent_name || '').toLowerCase();
              const fName = String(f.name || '').toLowerCase();
              if (fPath.includes('muhebrew') || fName.includes('muhebrew') || f.parent_id === rootFolderId) {
                const fid = String(f.id || f.hash || '');
                if (!seenFileIds.has(fid)) {
                  seenFileIds.add(fid);
                  allFiles.push({
                    id: fid,
                    name: f.name || 'document.pdf',
                    size: Number(f.file_size || f.size || 0),
                    mime: f.mime || f.mime_type || 'application/pdf',
                    url: f.url || f.download_url || null,
                    folderId: f.parent_id || rootFolderId,
                    folderPath: f.path || rootFolderName
                  });
                }
              }
            }
          }
        }
      } catch (_) {}
      if (allFiles.length > 0) break;
    }
  }

  return allFiles;
}

/**
 * List files (backward-compatible wrapper)
 */
async function listFiles(folderId) {
  const fid = folderId || DRIME_FOLDER_ID;
  const files = await listFilesUnderMuhebrew(fid, DRIME_FOLDER_NAME);
  if (files && files.length > 0) {
    return { ok: true, files };
  }
  return { ok: false, files: [], error: `No files found in Drime folder "${DRIME_FOLDER_NAME}"` };
}

/**
 * Get a direct download URL or stream buffer from Drime Cloud for a file id or URL
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
      console.warn('[Drime Cloud API] Direct URL download failed:', e.message);
    }
  }

  const cleanId = String(fileIdOrUrl).replace(/^drime:\/\//, '');

  const endpoints = [];
  for (const base of API_BASES) {
    endpoints.push(
      `${base}/file-entries/${cleanId}/download`,
      `${base}/files/${cleanId}/download`,
      `${base}/file-entries/download?entry_ids=${cleanId}`,
      `${base}/files/${cleanId}/content`,
      `${base}/downloads/${cleanId}`,
      `${base}/file-entries/${cleanId}`,
      `${base}/files/${cleanId}`
    );
  }
  endpoints.push(
    `https://dri.me/d/${cleanId}`,
    `https://dri.me/${cleanId}`,
    `https://app.drime.cloud/drive/s/${cleanId}`
  );

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
        const direct = data.url || data.download_url || data.direct_url || data.link || (data.file && data.file.url) || (data.entry && data.entry.url);
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

  return { ok: false, error: 'Could not download file from Drime Cloud Storage' };
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
    formData.append('path', `${DRIME_FOLDER_NAME}/${folderGroup}/${subject || 'General'}/${level || 'Form 4'}`);

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
 * Automatically scan Drime "Muhebrew" folder (and all subfolders) and sync files to the database
 * Creates or updates records in papers/books tables
 */
async function syncDrimeFilesToDatabase(db) {
  if (!db) return { ok: false, error: 'Database instance required' };

  try {
    // 1. Locate the Muhebrew folder in Drime Cloud Storage
    const muhebrewFolder = await locateMuhebrewFolder();
    const folderId = muhebrewFolder.id || DRIME_FOLDER_ID;
    const folderName = muhebrewFolder.name || DRIME_FOLDER_NAME;

    // 2. Scan all files under the Muhebrew folder (recursively scanning all subfolders)
    const files = await listFilesUnderMuhebrew(folderId, folderName);

    if (!Array.isArray(files) || files.length === 0) {
      return {
        ok: false,
        message: `No files found under Drime folder "${folderName}" (${DRIME_API_BASE})`,
        apiBase: DRIME_API_BASE,
        folderName,
        folderId,
        imported: 0,
        updated: 0,
        total: 0
      };
    }

    let importedCount = 0;
    let updatedCount = 0;
    const syncedList = [];

    for (const f of files) {
      const fileName = f.name || 'document.pdf';
      const fileSize = Number(f.size) || 1024;
      const fileId = String(f.id || `drime_${Date.now()}`);
      const fileUrl = f.url || `${DRIME_FOLDER_URL}/${encodeURIComponent(fileId)}`;

      const traced = autoTraceFile(fileName, fileSize);
      const isBook = traced.type === 'books' || String(f.folderPath || '').toLowerCase().includes('book') || String(f.folderPath || '').toLowerCase().includes('text');
      const table = isBook ? 'books' : 'papers';

      // Detect category context from subfolder paths
      const pathLower = String(f.folderPath || '').toLowerCase();
      let category = traced.category;
      if (pathLower.includes('mark') || pathLower.includes('scheme') || pathLower.includes('key')) {
        category = 'Marking Key';
      } else if (pathLower.includes('mock')) {
        category = 'Cluster Mock';
      } else if (pathLower.includes('maneb')) {
        category = 'MANEB';
      }

      // Clean title - eliminate redundant form labels at end
      let cleanTitle = (traced.title || fileName.replace(/\.[^/.]+$/, ''))
        .replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '')
        .replace(/\s+Form\s*[1-4]\s*$/i, '')
        .trim();

      if (category === 'Marking Key' && !cleanTitle.toLowerCase().includes('marking key')) {
        cleanTitle = cleanTitle.replace(/^Sample\s*-\s*/i, '');
        cleanTitle = `Marking Key - ${cleanTitle}`;
      }

      // Check if item already exists by drime_file_id or file_name
      const existing = db.prepare(
        `SELECT id, title FROM ${table} WHERE drime_file_id = ? OR (file_name = ? AND storage_provider = 'drime')`
      ).get(fileId, fileName);

      if (existing) {
        db.prepare(`
          UPDATE ${table} SET
            title = ?,
            drime_file_id = ?,
            drime_url = ?,
            drime_folder_id = ?,
            file_size = ?,
            status = 'approved'
          WHERE id = ?
        `).run(cleanTitle, fileId, fileUrl, f.folderId || folderId, fileSize, existing.id);
        updatedCount++;
        syncedList.push({ id: existing.id, title: cleanTitle, action: 'updated', folder: f.folderPath });
      } else {
        const defaultCategory = isBook ? 'MSCE' : (category || 'MANEB');
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
            `Synced from Drime folder "${folderName}" (${f.folderPath || ''})`,
            'drime://' + fileId,
            fileName,
            fileSize,
            f.mime || 'application/pdf',
            fileId,
            fileUrl,
            f.folderId || folderId
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
            `Synced from Drime folder "${folderName}" (${f.folderPath || ''})`,
            'drime://' + fileId,
            fileName,
            fileSize,
            f.mime || 'application/pdf',
            fileId,
            fileUrl,
            f.folderId || folderId
          );
        }
        importedCount++;
        syncedList.push({ title: cleanTitle, action: 'imported', folder: f.folderPath });
      }
    }

    console.log(`[Drime Auto-Sync] Synced ${importedCount} new, ${updatedCount} updated from Drime folder "${folderName}" (${files.length} total files)`);
    return {
      ok: true,
      apiBase: DRIME_API_BASE,
      folderName,
      folderId,
      imported: importedCount,
      updated: updatedCount,
      total: files.length,
      files: syncedList
    };
  } catch (err) {
    console.error('[Drime Auto-Sync] Error during sync:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  DRIME_API_KEY,
  DRIME_FOLDER_NAME,
  DRIME_FOLDER_ID,
  DRIME_FOLDER_URL,
  DRIME_API_BASE,
  getStatus,
  getFolderIdForType,
  locateMuhebrewFolder,
  listFilesUnderMuhebrew,
  listFiles,
  downloadFile,
  uploadToDrime,
  syncDrimeFilesToDatabase
};

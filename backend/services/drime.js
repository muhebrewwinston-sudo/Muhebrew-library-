/**
 * Drime Cloud = primary file storage for Muhebrew Library
 * Website server talks to Drime API: list, upload, download/stream
 */
const fs = require('fs');
const path = require('path');

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
  return {
    Authorization: `Bearer ${DRIME_API_KEY}`,
    Accept: 'application/json'
  };
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
    enabled: Boolean(DRIME_API_KEY),
    provider: 'drime',
    name: 'Drime Cloud Storage',
    folderId: DRIME_FOLDER_ID,
    folderUrl: DRIME_FOLDER_URL,
    folders: FOLDER_MAP,
    hasApiKey: Boolean(DRIME_API_KEY),
    status: DRIME_API_KEY ? 'configured' : 'missing_api_key'
  };
}

/**
 * List files in a Drime folder (for sync / browse)
 */
async function listFiles(folderId) {
  const fid = folderId || DRIME_FOLDER_ID;
  if (!DRIME_API_KEY) return { ok: false, files: [], error: 'DRIME_API_KEY not set' };

  const endpoints = [
    `${DRIME_API_BASE}/folders/${fid}/files`,
    `${DRIME_API_BASE}/files?folder_id=${encodeURIComponent(fid)}`,
    `${DRIME_API_BASE}/files?parent_id=${encodeURIComponent(fid)}`,
    `${DRIME_API_BASE}/entries?folder_id=${encodeURIComponent(fid)}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : data.files || data.data || data.items || data.entries || [];
      if (!Array.isArray(list)) continue;
      return {
        ok: true,
        files: list.map((f) => ({
          id: String(f.id || f.file_id || f.uuid || ''),
          name: f.name || f.filename || f.title || f.original_name || 'file',
          size: f.size || f.bytes || 0,
          mime: f.mime || f.mime_type || f.content_type || 'application/pdf',
          url: f.url || f.download_url || f.link || null,
          folderId: fid
        })).filter((f) => f.id || f.name)
      };
    } catch (e) {
      console.log('[Drime] listFiles try failed:', e.message);
    }
  }
  return { ok: false, files: [], error: 'Could not list Drime folder (check API key / folder id)' };
}

/**
 * Get a direct download URL or stream buffer from Drime for a file id
 */
async function downloadFile(fileId) {
  if (!DRIME_API_KEY || !fileId) return { ok: false, error: 'Missing API key or file id' };

  const endpoints = [
    `${DRIME_API_BASE}/files/${fileId}/download`,
    `${DRIME_API_BASE}/files/${fileId}/content`,
    `${DRIME_API_BASE}/downloads/${fileId}`,
    `${DRIME_API_BASE}/files/${fileId}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { ...authHeaders() },
        redirect: 'follow'
      });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      // JSON metadata with url inside
      if (ct.includes('application/json')) {
        const data = await res.json();
        const direct = data.url || data.download_url || data.link || (data.file && data.file.url);
        if (direct) {
          const fileRes = await fetch(direct);
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
      console.log('[Drime] download try failed:', e.message);
    }
  }
  return { ok: false, error: 'Could not download file from Drime' };
}

async function uploadToDrime({ filePath, originalName, mimeType, folderId, category, subject, level }) {
  const isMarking = (category || '').toLowerCase().includes('mark') || (originalName || '').toLowerCase().includes('mark');
  const targetFolder = folderId || (isMarking ? FOLDER_MAP.marking : DRIME_FOLDER_ID);
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found at ${absPath}`);
  }

  const fileSize = fs.statSync(absPath).size;
  const fileHash = `drime_ref_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

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
      console.log(`[Drime] Upload OK: ${originalName} -> ${drimeFileId}`);
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
    console.log('[Drime] Upload status:', response.status);
  } catch (err) {
    console.log('[Drime] Upload error:', err.message);
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

module.exports = {
  DRIME_API_KEY,
  DRIME_FOLDER_ID,
  DRIME_FOLDER_URL,
  DRIME_API_BASE,
  getStatus,
  getFolderIdForType,
  listFiles,
  downloadFile,
  uploadToDrime
};

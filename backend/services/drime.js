/**
 * Drime Cloud = primary file storage for Muhebrew Library
 * Communicates with Drime Cloud API (https://app.drime.cloud/api/v1) and public folder shares (https://dri.me/fngud8DkQTOTNvd1MmAXhszXKIm60k):
 * Scans the "Muhebrew" folder and its subfolders, discovers all documents, and auto-syncs them directly into the website library.
 */
const fs = require('fs');
const path = require('path');
const { autoTraceFile } = require('../utils/autotrace');

// Default API base and folder provided by user
const DRIME_API_BASE = (process.env.DRIME_API_BASE || 'https://app.drime.cloud/api/v1').replace(/\/$/, '');
const DRIME_API_KEY = process.env.DRIME_API_KEY || '109407|8C0QMXEiTVZI9IGuzTPd6UT1Dit6IN4w5Id3nfiGa2800711';
const DRIME_FOLDER_NAME = process.env.DRIME_FOLDER_NAME || 'Muhebrew';
const DRIME_FOLDER_ID = process.env.DRIME_FOLDER_ID || 'fngud8DkQTOTNvd1MmAXhszXKIm60k';
const DRIME_FOLDER_URL = process.env.DRIME_FOLDER_URL || 'https://dri.me/fngud8DkQTOTNvd1MmAXhszXKIm60k';

// Known folder targets (active link first, then fallbacks)
const FOLDER_TARGETS = [
  'fngud8DkQTOTNvd1MmAXhszXKIm60k',
  DRIME_FOLDER_ID,
  'BiWwc46CM0eJ0yzuDOJu5jxg1L8yfw'
].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

// Fallback API hosts
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
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
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
    folderTargets: FOLDER_TARGETS,
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
 * Recursively extract file and folder entries from nested JSON structures
 * (Inertia data-page, BeDrive models, shares, folders, and arrays)
 */
function extractEntriesFromObject(obj, results = [], parentPath = 'Muhebrew') {
  if (!obj || typeof obj !== 'object') return results;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractEntriesFromObject(item, results, parentPath);
    }
    return results;
  }

  // Check if obj represents a file
  const hasFileName = obj.name || obj.file_name || obj.original_name || obj.title;
  const isExplicitFolder = obj.type === 'folder' || obj.is_dir === true || obj.mime === 'directory' || obj.mime_type === 'directory';
  const hasExtension = hasFileName && /\.[a-z0-9]{2,5}$/i.test(String(hasFileName));
  const isPdfOrDoc = hasFileName && /\.(pdf|doc|docx|epub|jpg|jpeg|png)$/i.test(String(hasFileName));
  const isFile = !isExplicitFolder && (obj.type === 'file' || isPdfOrDoc || (hasExtension && (obj.file_size || obj.size || obj.bytes)));

  if (isFile) {
    const fileId = String(obj.id || obj.hash || obj.file_id || obj.uuid || '');
    const fileName = String(hasFileName || 'document.pdf');
    const size = Number(obj.file_size || obj.size || obj.bytes || 0);
    const mime = String(obj.mime || obj.mime_type || obj.content_type || 'application/pdf');
    const url = obj.url || obj.download_url || obj.link || (obj.hash ? `https://dri.me/${obj.hash}` : null);

    results.push({
      id: fileId || `drime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: fileName,
      size: size > 0 ? size : 1024,
      mime: mime.includes('/') ? mime : 'application/pdf',
      url,
      folderPath: parentPath
    });
  }

  // If this object is a folder or contains sub-items, recurse into children
  const folderName = isExplicitFolder && hasFileName ? String(hasFileName) : '';
  const nextPath = folderName && folderName !== parentPath ? `${parentPath}/${folderName}` : parentPath;

  const childArrays = [obj.children, obj.entries, obj.files, obj.subfolders, obj.items, obj.data];
  for (const arr of childArrays) {
    if (Array.isArray(arr)) {
      extractEntriesFromObject(arr, results, nextPath);
    }
  }

  // Common wrapper properties
  const wrapperProps = ['link', 'entry', 'folder', 'props', 'share'];
  for (const prop of wrapperProps) {
    if (obj[prop] && typeof obj[prop] === 'object') {
      extractEntriesFromObject(obj[prop], results, nextPath);
    }
  }

  return results;
}

/**
 * Parse files from HTML page (Drime Inertia / script payloads / JSON snippets)
 */
function extractFilesInHtml(html, defaultPath = 'Muhebrew') {
  const allFiles = [];

  // 1. Inertia data-page attribute
  try {
    const inertiaMatch = html.match(/data-page="([^"]+)"/i);
    if (inertiaMatch) {
      const decoded = decodeHtmlEntities(inertiaMatch[1]);
      const data = JSON.parse(decoded);
      extractEntriesFromObject(data, allFiles, defaultPath);
    }
  } catch (_) {}

  // 2. Embedded JSON in script tags (window.bootstrapData, window.__INITIAL_STATE__, etc.)
  try {
    const scriptRegex = /<script[^>]*>(.*?)<\/script>/gis;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1];
      if (content.includes('bootstrapData') || content.includes('__INITIAL_STATE__') || content.includes('drimeData')) {
        const jsonMatch = content.match(/=\s*(\{.*?\});/s);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[1]);
            extractEntriesFromObject(data, allFiles, defaultPath);
          } catch (_) {}
        }
      } else if (match[0].includes('type="application/json"') || match[0].includes('id="bootstrap-data"')) {
        try {
          const data = JSON.parse(content.trim());
          extractEntriesFromObject(data, allFiles, defaultPath);
        } catch (_) {}
      }
    }
  } catch (_) {}

  // 3. Fallback regex search for JSON objects containing document files
  if (allFiles.length === 0) {
    try {
      const objRegex = /\{[^{}]*"(?:name|file_name)"\s*:\s*"([^"]+\.(?:pdf|doc|docx))"[^{}]*\}/gi;
      let objMatch;
      while ((objMatch = objRegex.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          extractEntriesFromObject(parsed, allFiles, defaultPath);
        } catch (_) {}
      }
    } catch (_) {}
  }

  return allFiles;
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
 * Fetch and extract file entries from a public Drime share (https://dri.me/{hash})
 */
async function fetchShareEntries(shareHash) {
  const hash = String(shareHash || '').trim();
  if (!hash) return [];

  const endpoints = [
    `https://dri.me/${encodeURIComponent(hash)}`,
    `https://app.drime.cloud/drive/s/${encodeURIComponent(hash)}`,
    `${DRIME_API_BASE}/shares/${encodeURIComponent(hash)}`,
    `${DRIME_API_BASE}/shares/${encodeURIComponent(hash)}/entries`,
    `${DRIME_API_BASE}/shareable-links/${encodeURIComponent(hash)}`,
    `${DRIME_API_BASE}/shareable-links/${encodeURIComponent(hash)}/entries`,
    `${DRIME_API_BASE}/folders/${encodeURIComponent(hash)}`,
    `${DRIME_API_BASE}/folders/${encodeURIComponent(hash)}/files`,
    `${DRIME_API_BASE}/file-entries?parent_id=${encodeURIComponent(hash)}&per_page=150`,
    `https://dri.me/api/v1/shares/${encodeURIComponent(hash)}`
  ];

  const headersList = [
    {
      Accept: 'application/json, text/html, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    authHeaders()
  ];

  for (const url of endpoints) {
    for (const hdrs of headersList) {
      try {
        const res = await fetch(url, { headers: hdrs, redirect: 'follow' });
        if (!res.ok) continue;

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
          const data = await res.json();
          const extracted = extractEntriesFromObject(data, [], DRIME_FOLDER_NAME);
          if (extracted.length > 0) {
            console.log(`[Drime Share] Found ${extracted.length} files from JSON: ${url}`);
            return extracted;
          }
        } else {
          const html = await res.text();
          const extracted = extractFilesInHtml(html, DRIME_FOLDER_NAME);
          if (extracted.length > 0) {
            console.log(`[Drime Share] Found ${extracted.length} files from HTML: ${url}`);
            return extracted;
          }
        }
      } catch (_) {}
    }
  }

  return [];
}

/**
 * Recursively list all files under the Muhebrew folder in Drime Cloud Storage
 */
async function listFilesUnderMuhebrew(rootFolderId, rootFolderName = 'Muhebrew') {
  const allFiles = [];
  const seenFileKeys = new Set();

  function addFile(f) {
    const key = (f.id && f.id !== 'undefined') ? f.id : f.name;
    if (!key || seenFileKeys.has(key)) return;
    seenFileKeys.add(key);
    allFiles.push(f);
  }

  // 1. Check all target share hashes (starting with the active user link)
  for (const targetId of FOLDER_TARGETS) {
    try {
      const shareFiles = await fetchShareEntries(targetId);
      for (const sf of shareFiles) {
        addFile(sf);
      }
    } catch (_) {}
  }

  // 2. Query authenticated API folder endpoints if API key is present
  if (DRIME_API_KEY) {
    const visitedFolders = new Set();
    const folderQueue = [{ id: rootFolderId, path: rootFolderName }];

    for (const targetId of FOLDER_TARGETS) {
      if (!visitedFolders.has(targetId)) {
        folderQueue.push({ id: targetId, path: rootFolderName });
      }
    }

    while (folderQueue.length > 0) {
      const current = folderQueue.shift();
      const fid = current.id;
      if (!fid || visitedFolders.has(String(fid))) continue;
      visitedFolders.add(String(fid));

      let folderEntries = [];

      for (const base of API_BASES) {
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
            const extracted = extractEntriesFromObject(data, [], current.path);
            if (extracted.length > 0) {
              folderEntries = extracted;
              break;
            }
          } catch (_) {}
        }
        if (folderEntries.length > 0) break;
      }

      for (const item of folderEntries) {
        addFile(item);
      }
    }

    // 3. Drive-wide file entries scan for all document assets
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
              const fName = String(f.name || f.file_name || '').toLowerCase();
              const isDoc = fName.match(/\.(pdf|doc|docx|epub|pptx|ppt|txt)$/i) || f.type === 'file' || String(f.mime || '').includes('pdf');
              if (isDoc) {
                addFile({
                  id: String(f.id || f.hash || ''),
                  name: f.name || f.file_name || 'document.pdf',
                  size: Number(f.file_size || f.size || 1024),
                  mime: f.mime || f.mime_type || 'application/pdf',
                  url: f.url || f.download_url || (f.hash ? `https://dri.me/${f.hash}` : null),
                  folderId: f.parent_id || rootFolderId,
                  folderPath: f.path || rootFolderName
                });
              }
            }
          }
        }
      } catch (_) {}
    }
  }

  return allFiles;
}

/**
 * Backward-compatible listFiles wrapper
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

  // If a direct URL was provided
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
    `https://app.drime.cloud/drive/s/fngud8DkQTOTNvd1MmAXhszXKIm60k?file=${cleanId}`,
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
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100) {
        return {
          ok: true,
          buffer: buf,
          contentType: res.headers.get('content-type') || 'application/pdf'
        };
      }
    } catch (_) {}
  }

  return { ok: false, error: 'Could not download file from Drime Cloud Storage' };
}

/**
 * Stream a file from Drime Cloud directly to an Express response stream
 * Zero local disk usage: pipes incoming remote chunks directly to client socket
 */
async function streamFile(fileIdOrUrl, res, filename = 'document.pdf') {
  if (!fileIdOrUrl) return false;

  const { Readable } = require('stream');
  const cleanId = String(fileIdOrUrl).replace(/^drime:\/\//, '');
  const candidateUrls = [];

  if (String(fileIdOrUrl).startsWith('http://') || String(fileIdOrUrl).startsWith('https://')) {
    candidateUrls.push(fileIdOrUrl);
  }

  for (const base of API_BASES) {
    candidateUrls.push(
      `${base}/file-entries/${cleanId}/download`,
      `${base}/files/${cleanId}/download`,
      `${base}/file-entries/download?entry_ids=${cleanId}`,
      `${base}/downloads/${cleanId}`
    );
  }
  candidateUrls.push(
    `https://dri.me/d/${cleanId}`,
    `https://dri.me/${cleanId}`
  );

  for (const url of candidateUrls) {
    try {
      const upstream = await fetch(url, {
        headers: DRIME_API_KEY ? { ...authHeaders() } : { Accept: '*/*' },
        redirect: 'follow'
      });
      if (!upstream.ok) continue;

      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      // If endpoint returns a JSON payload containing the actual direct link
      if (ct.includes('application/json')) {
        const data = await upstream.json();
        const direct = data.url || data.download_url || data.direct_url || data.link || (data.file && data.file.url) || (data.entry && data.entry.url);
        if (direct) {
          const directRes = await fetch(direct, { redirect: 'follow' });
          if (directRes.ok && directRes.body) {
            res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
            res.setHeader('Content-Type', directRes.headers.get('content-type') || 'application/pdf');
            if (directRes.headers.get('content-length')) {
              res.setHeader('Content-Length', directRes.headers.get('content-length'));
            }
            Readable.fromWeb(directRes.body).pipe(res);
            return true;
          }
        }
        continue;
      }

      if (upstream.body) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/pdf');
        if (upstream.headers.get('content-length')) {
          res.setHeader('Content-Length', upstream.headers.get('content-length'));
        }
        Readable.fromWeb(upstream.body).pipe(res);
        return true;
      }
    } catch (_) {}
  }

  return false;
}

/**
 * Create or retrieve a shareable download link for a Drime file
 * Official Drime Cloud API: POST /shares or public share resolution
 */
async function createShareableLink(fileIdOrHash) {
  if (!fileIdOrHash) return null;
  const cleanId = String(fileIdOrHash).replace(/^drime:\/\//, '');

  if (String(fileIdOrHash).startsWith('http://') || String(fileIdOrHash).startsWith('https://')) {
    return fileIdOrHash;
  }

  if (!DRIME_API_KEY) {
    return `https://dri.me/${cleanId}`;
  }

  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}/shares`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entry_id: cleanId,
          allow_download: true,
          type: 'file'
        })
      });
      if (res.ok) {
        const data = await res.json();
        const link = data.link || (data.share && data.share.link) || data.url;
        if (link) return link;
      }
    } catch (_) {}
  }

  return `https://dri.me/${cleanId}`;
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
        message: `No files found under Drime folder "${folderName}" (${DRIME_FOLDER_URL})`,
        apiBase: DRIME_API_BASE,
        folderName,
        folderId,
        folderUrl: DRIME_FOLDER_URL,
        imported: 0,
        updated: 0,
        total: 0
      };
    }

    let importedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;
    const syncedList = [];
    const activeRowIdsByTable = { books: new Set(), papers: new Set() };

    // Lazy-require thumbnail service to pre-warm thumbnails
    let thumbnailService = null;
    try {
      thumbnailService = require('./thumbnail');
    } catch (_) {}

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

      // Check if item already exists by drime_file_id, file_name, or title
      let existing = db.prepare(
        `SELECT id, title FROM ${table} WHERE drime_file_id = ? OR (file_name = ? AND storage_provider = 'drime')`
      ).get(fileId, fileName);

      if (!existing) {
        existing = db.prepare(
          `SELECT id, title FROM ${table} WHERE LOWER(title) = ?`
        ).get(cleanTitle.toLowerCase());
      }

      let rowId;
      if (existing) {
        rowId = existing.id;
        db.prepare(`
          UPDATE ${table} SET
            title = ?,
            drime_file_id = ?,
            drime_url = ?,
            drime_folder_id = ?,
            file_size = ?,
            status = 'approved'
          WHERE id = ?
        `).run(cleanTitle, fileId, fileUrl, f.folderId || folderId, fileSize, rowId);
        updatedCount++;
        syncedList.push({ id: rowId, title: cleanTitle, action: 'updated', folder: f.folderPath });
      } else {
        const defaultCategory = isBook ? 'MSCE' : (category || 'MANEB');
        if (isBook) {
          const info = db.prepare(`
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
          rowId = info.lastInsertRowid;
        } else {
          const info = db.prepare(`
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
          rowId = info.lastInsertRowid;
        }
        importedCount++;
        syncedList.push({ id: rowId, title: cleanTitle, action: 'imported', folder: f.folderPath });
      }

      if (rowId) {
        activeRowIdsByTable[table].add(rowId);
      }

      // Pre-warm thumbnail
      if (thumbnailService && rowId) {
        try {
          const itemRow = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId);
          thumbnailService.getOrGenerateThumbnail(isBook ? 'book' : 'paper', rowId, itemRow, module.exports).catch(() => {});
        } catch (_) {}
      }
    }

    // Persist all approved items into drime_catalog.json registry
    if (typeof db.saveCatalogToRegistry === 'function') {
      try {
        db.saveCatalogToRegistry();
      } catch (_) {}
    }

    console.log(`[Drime Auto-Sync] Synced ${importedCount} new, ${updatedCount} updated from Drime folder "${folderName}" (${files.length} total files)`);
    return {
      ok: true,
      apiBase: DRIME_API_BASE,
      folderName,
      folderId,
      folderUrl: DRIME_FOLDER_URL,
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

/**
 * Live search against Drime Cloud Storage
 * Coordinates querying Drime Cloud API & share targets for a search query,
 * auto-traces and indexes any new/unindexed files into SQLite,
 * and returns the matched items so the server coordinator reflects them to the web.
 */
async function searchDrimeCloud(query, db) {
  if (!query || String(query).trim().length < 2) return [];
  const qClean = String(query).trim();
  const qLower = qClean.toLowerCase();

  const matchedDrimeFiles = [];
  const seenIds = new Set();

  // 1. Check Drime API search endpoints if API key is present
  if (DRIME_API_KEY) {
    for (const base of API_BASES) {
      const searchUrls = [
        `${base}/file-entries?query=${encodeURIComponent(qClean)}&per_page=100`,
        `${base}/search?query=${encodeURIComponent(qClean)}`,
        `${base}/drive/file-entries?query=${encodeURIComponent(qClean)}`,
        `${base}/file-entries?per_page=150`
      ];

      for (const url of searchUrls) {
        try {
          const res = await fetch(url, { headers: authHeaders() });
          if (!res.ok) continue;
          const data = await res.json();
          const items = Array.isArray(data) ? data : (data.data || data.entries || data.files || []);
          if (Array.isArray(items)) {
            for (const item of items) {
              const fid = String(item.id || item.hash || item.uuid || '');
              const fname = item.name || item.title || item.file_name || '';
              if (!fname || seenIds.has(fid)) continue;
              const fPath = String(item.path || item.parent_name || '').toLowerCase();
              const fLower = fname.toLowerCase();
              if (url.includes('per_page=150') && !url.includes('query=')) {
                if (!fLower.includes(qLower) && !fPath.includes(qLower)) continue;
              }
              seenIds.add(fid);
              matchedDrimeFiles.push({
                id: fid,
                name: fname,
                size: Number(item.file_size || item.size || item.file_size_bytes || 1024),
                mime: item.mime || item.type || 'application/pdf',
                url: item.url || `${DRIME_FOLDER_URL}/${encodeURIComponent(fid)}`,
                folderId: item.folder_id || item.parent_id || DRIME_FOLDER_ID,
                folderPath: item.path || DRIME_FOLDER_NAME
              });
            }
          }
        } catch (_) {}
      }
    }
  }

  // 2. Also search across all discovered files in the Muhebrew folder targets
  try {
    for (const targetId of FOLDER_TARGETS) {
      const shareFiles = await fetchShareEntries(targetId);
      for (const sf of shareFiles) {
        const nameLower = String(sf.name || '').toLowerCase();
        const fid = String(sf.id || sf.name);
        if (nameLower.includes(qLower) && !seenIds.has(fid)) {
          seenIds.add(fid);
          matchedDrimeFiles.push(sf);
        }
      }
    }
  } catch (_) {}

  if (!db || matchedDrimeFiles.length === 0) {
    return matchedDrimeFiles;
  }

  // 3. Coordinator: ingest / reflect matched Drime files into database so they appear in search results
  const reflectedItems = [];

  for (const f of matchedDrimeFiles) {
    try {
      const fileName = f.name || 'document.pdf';
      const fileSize = Number(f.size) || 1024;
      const fileId = String(f.id || `drime_${Date.now()}`);
      const fileUrl = f.url || `${DRIME_FOLDER_URL}/${encodeURIComponent(fileId)}`;

      const traced = autoTraceFile(fileName, fileSize);
      const isBook = traced.type === 'books' || String(f.folderPath || '').toLowerCase().includes('book');
      const table = isBook ? 'books' : 'papers';
      const category = traced.category || (isBook ? 'MSCE' : 'MANEB');

      let cleanTitle = (traced.title || fileName.replace(/\.[^/.]+$/, ''))
        .replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '')
        .replace(/\s+Form\s*[1-4]\s*$/i, '')
        .trim();

      let existing = db.prepare(`SELECT id FROM ${table} WHERE drime_file_id = ? OR file_name = ?`).get(fileId, fileName);

      let rowId;
      if (!existing) {
        if (isBook) {
          const info = db.prepare(`
            INSERT INTO books (
              title, subject, level, category, author, description,
              file_path, file_name, file_size, mime_type,
              storage_provider, drime_file_id, drime_url, drime_folder_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'drime', ?, ?, ?, 'approved')
          `).run(
            cleanTitle,
            traced.subject || 'General Studies',
            traced.level || 'Form 4',
            category,
            traced.author || 'Ministry of Education',
            `Sourced from Drime Cloud (${DRIME_FOLDER_NAME})`,
            'drime://' + fileId,
            fileName,
            fileSize,
            f.mime || 'application/pdf',
            fileId,
            fileUrl,
            f.folderId || DRIME_FOLDER_ID
          );
          rowId = info.lastInsertRowid;
        } else {
          const info = db.prepare(`
            INSERT INTO papers (
              title, subject, level, category, year, exam_board, description,
              file_path, file_name, file_size, mime_type,
              storage_provider, drime_file_id, drime_url, drime_folder_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'drime', ?, ?, ?, 'approved')
          `).run(
            cleanTitle,
            traced.subject || 'General Studies',
            traced.level || 'Form 4',
            category,
            traced.year || new Date().getFullYear(),
            traced.exam_board || (category === 'Cluster Mock' ? 'Cluster Mock' : 'MANEB'),
            `Sourced from Drime Cloud (${DRIME_FOLDER_NAME})`,
            'drime://' + fileId,
            fileName,
            fileSize,
            f.mime || 'application/pdf',
            fileId,
            fileUrl,
            f.folderId || DRIME_FOLDER_ID
          );
          rowId = info.lastInsertRowid;
        }
      } else {
        rowId = existing.id;
      }

      if (rowId) {
        const fullRow = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId);
        if (fullRow) {
          reflectedItems.push({ ...fullRow, _type: isBook ? 'book' : 'paper' });
        }
      }
    } catch (_) {}
  }

  if (reflectedItems.length > 0 && typeof db.saveCatalogToRegistry === 'function') {
    try {
      db.saveCatalogToRegistry();
    } catch (_) {}
  }

  return reflectedItems;
}

// Coordinator state tracking
const coordinatorState = {
  active: false,
  intervalMs: 60000,
  timer: null,
  isSyncing: false,
  lastSyncAt: null,
  lastSyncResult: null,
  totalSourced: 0,
  folderUrl: DRIME_FOLDER_URL,
  folderId: DRIME_FOLDER_ID
};

function getCoordinatorStatus() {
  const { timer, ...rest } = coordinatorState;
  return {
    ...rest,
    hasActiveTimer: Boolean(timer),
    apiKeyConfigured: Boolean(DRIME_API_KEY),
    folderTargets: FOLDER_TARGETS,
    apiBase: DRIME_API_BASE
  };
}

function startCoordinator({ db, intervalMs = 60000 }) {
  if (process.env.VERCEL) {
    // In Vercel serverless environment, background intervals are skipped
    // Sourcing coordinates on-demand when search and resource queries run
    return coordinatorState;
  }

  if (coordinatorState.active && coordinatorState.timer) {
    return coordinatorState;
  }

  coordinatorState.active = true;
  coordinatorState.intervalMs = intervalMs;

  const runSync = async () => {
    if (coordinatorState.isSyncing || !db) return;
    coordinatorState.isSyncing = true;
    try {
      const res = await syncDrimeFilesToDatabase(db);
      coordinatorState.lastSyncAt = new Date().toISOString();
      coordinatorState.lastSyncResult = res;
      if (res && typeof res.total === 'number') {
        coordinatorState.totalSourced = res.total;
      }
    } catch (err) {
      console.warn('[Drime Coordinator] Sourcing note:', err.message);
    } finally {
      coordinatorState.isSyncing = false;
    }
  };

  setTimeout(runSync, 3000);
  coordinatorState.timer = setInterval(runSync, intervalMs);
  console.log(`[Drime Coordinator] Active - sourcing from Drime Cloud every ${Math.round(intervalMs / 1000)}s`);

  return coordinatorState;
}

module.exports = {
  DRIME_API_KEY,
  DRIME_FOLDER_NAME,
  DRIME_FOLDER_ID,
  DRIME_FOLDER_URL,
  DRIME_API_BASE,
  FOLDER_TARGETS,
  getStatus,
  getFolderIdForType,
  locateMuhebrewFolder,
  fetchShareEntries,
  listFilesUnderMuhebrew,
  listFiles,
  downloadFile,
  streamFile,
  createShareableLink,
  uploadToDrime,
  syncDrimeFilesToDatabase,
  searchDrimeCloud,
  startCoordinator,
  getCoordinatorStatus
};

/**
 * Thumbnail Generation Service
 * Renders the authentic front page of PDF documents as JPEG thumbnails.
 * Caches thumbnails on disk in backend/uploads/thumbnails/ for instant subsequent requests.
 */

const fs = require('fs');
const path = require('path');
const canvas = require('@napi-rs/canvas');

// Polyfill canvas globals for pdfjs-dist legacy build
global.DOMMatrix = canvas.DOMMatrix;
global.Path2D = canvas.Path2D;
global.ImageData = canvas.ImageData;
global.DOMPoint = canvas.DOMPoint;
global.DOMRect = canvas.DOMRect;

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const THUMBNAIL_DIR = path.join(__dirname, '..', 'uploads', 'thumbnails');
fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

// Node.js canvas factory for pdfjs-dist
class NodeCanvasFactory {
  create(width, height) {
    const c = canvas.createCanvas(width, height);
    const context = c.getContext('2d');
    return { canvas: c, context };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * Render the first page of a PDF buffer into a JPEG file
 * @param {Buffer} pdfBuffer
 * @param {string} outputPath
 * @param {number} targetWidth
 */
async function renderPdfPageToJpeg(pdfBuffer, outputPath, targetWidth = 240) {
  const canvasFactory = new NodeCanvasFactory();
  const fontDir = path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts') + '/';

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: fontDir,
    canvasFactory
  });

  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);
  const unscaled = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / (unscaled.width || 1);
  const viewport = page.getViewport({ scale });

  const cv = canvasFactory.create(Math.round(viewport.width), Math.round(viewport.height));
  await page.render({
    canvasContext: cv.context,
    viewport
  }).promise;

  const jpegBuf = cv.canvas.toBuffer('image/jpeg', 85);
  fs.writeFileSync(outputPath, jpegBuf);
  return { ok: true, path: outputPath, size: jpegBuf.length };
}

/**
 * Generate a styled front cover fallback thumbnail if PDF rendering cannot run
 */
function renderFallbackThumbnail(type, item, outputPath) {
  const width = 240;
  const height = 310;
  const c = canvas.createCanvas(width, height);
  const ctx = c.getContext('2d');

  const title = (item && (item.title || item.file_name)) || 'Document';
  const subject = (item && item.subject) || 'General Studies';
  const level = (item && item.level) || 'Form 4';
  const board = (item && (item.exam_board || item.category)) || (type === 'book' ? 'TEXTBOOK' : 'MANEB');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // Top header banner
  const isKey = String(board || title).toLowerCase().includes('key') || String(board || title).toLowerCase().includes('marking');
  const isMock = String(board || title).toLowerCase().includes('mock');
  ctx.fillStyle = isKey ? '#dc2626' : (isMock ? '#15803d' : '#0284c7');
  ctx.fillRect(0, 0, width, 40);

  // Header text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((isKey ? 'MARKING KEY' : (board || (type === 'book' ? 'TEXTBOOK' : 'MANEB'))).toUpperCase(), width / 2, 25);

  // Subject
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(subject.slice(0, 22), width / 2, 90);

  // Level
  ctx.fillStyle = '#64748b';
  ctx.font = '13px sans-serif';
  ctx.fillText(level.slice(0, 22), width / 2, 115);

  // Decorative document lines
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(30, 140, width - 60, 6);
  ctx.fillRect(30, 155, width - 60, 6);
  ctx.fillRect(30, 170, width - 100, 6);
  ctx.fillRect(30, 185, width - 80, 6);

  // Title box
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.fillRect(20, 210, width - 40, 55);
  ctx.strokeRect(20, 210, width - 40, 55);

  ctx.fillStyle = '#1e293b';
  ctx.font = '11px sans-serif';
  const cleanTitle = title.replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '').trim();
  ctx.fillText(cleanTitle.slice(0, 32), width / 2, 235);
  ctx.fillText(type === 'book' ? 'Ministry Textbook' : 'National Examination', width / 2, 252);

  // Bottom footer tag
  ctx.fillStyle = '#0f766e';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('MUHEBREW DIGITAL LIBRARY', width / 2, 292);

  const buf = c.canvas.toBuffer('image/jpeg', 85);
  fs.writeFileSync(outputPath, buf);
  return { ok: true, path: outputPath, size: buf.length, fallback: true };
}

/**
 * Get or generate the front page thumbnail for a resource
 * @param {string} rawType 'paper', 'papers', 'book', 'books'
 * @param {number|string} id
 * @param {object} item DB record
 * @param {object} drimeService Drime service instance
 */
async function getOrGenerateThumbnail(rawType, id, item, drimeService) {
  const normType = String(rawType).startsWith('book') ? 'book' : 'paper';
  const fileName = `${normType}_${id}.jpg`;
  const outputPath = path.join(THUMBNAIL_DIR, fileName);

  // 1. Check if cached thumbnail exists
  try {
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 200) {
        return { ok: true, path: outputPath, cached: true };
      }
    }
  } catch (_) {}

  // 2. Try to get PDF bytes
  let pdfBuffer = null;

  // 2a. Check if existing cover_path image exists
  if (item && item.cover_path) {
    const cp = path.join(__dirname, '..', item.cover_path);
    if (fs.existsSync(cp)) {
      return { ok: true, path: cp, cached: true };
    }
  }

  // 2b. Check local file path if present
  if (item && item.file_path && !String(item.file_path).startsWith('drime://')) {
    const localP = path.join(__dirname, '..', item.file_path);
    if (fs.existsSync(localP)) {
      try {
        pdfBuffer = fs.readFileSync(localP);
      } catch (_) {}
    }
  }

  // 2c. Check Drime Cloud Storage
  if (!pdfBuffer && drimeService && item) {
    const drimeId = item.drime_file_id || (String(item.file_path || '').startsWith('drime://') ? item.file_path.replace('drime://', '') : null);
    if (drimeId || item.drime_url) {
      try {
        const cloudRes = await drimeService.downloadFile(drimeId || item.drime_url);
        if (cloudRes.ok && cloudRes.buffer) {
          pdfBuffer = cloudRes.buffer;
        }
      } catch (err) {
        console.warn(`[Thumbnail] Drime fetch failed for ${normType} ${id}:`, err.message);
      }
    }
  }

  // 3. Render real PDF page if buffer is available
  if (pdfBuffer && pdfBuffer.length > 500) {
    try {
      const res = await renderPdfPageToJpeg(pdfBuffer, outputPath, 240);
      return res;
    } catch (err) {
      console.warn(`[Thumbnail] Real PDF render error for ${normType} ${id}:`, err.message);
    }
  }

  // 4. Fallback styled front cover
  try {
    const res = renderFallbackThumbnail(normType, item, outputPath);
    return res;
  } catch (err) {
    console.error(`[Thumbnail] Fallback render error:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Generate thumbnail directly from a temporary uploaded PDF file before deleting it
 * @param {string} tempPdfPath
 * @param {string} rawType 'paper' or 'book'
 * @param {number|string} id
 */
async function generateThumbnailFromLocalUpload(tempPdfPath, rawType, id) {
  const normType = String(rawType).startsWith('book') ? 'book' : 'paper';
  const outputPath = path.join(THUMBNAIL_DIR, `${normType}_${id}.jpg`);
  try {
    if (fs.existsSync(tempPdfPath)) {
      const buf = fs.readFileSync(tempPdfPath);
      return await renderPdfPageToJpeg(buf, outputPath, 240);
    }
  } catch (e) {
    console.warn(`[Thumbnail] Upload pre-render error:`, e.message);
  }
  return { ok: false };
}

module.exports = {
  THUMBNAIL_DIR,
  renderPdfPageToJpeg,
  renderFallbackThumbnail,
  getOrGenerateThumbnail,
  generateThumbnailFromLocalUpload
};

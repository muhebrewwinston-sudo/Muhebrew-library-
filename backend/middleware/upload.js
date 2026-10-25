const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', 'uploads');
for (const d of ['papers', 'books', 'covers']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.zip', '.jpg', '.jpeg', '.png', '.webp']);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const bucket = file.fieldname === 'cover' ? 'covers' : req.uploadType === 'book' ? 'books' : 'papers';
    cb(null, path.join(ROOT, bucket));
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + '-' + safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 40) * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(Object.assign(new Error('Unsupported file type: ' + ext), { status: 400 }));
    cb(null, true);
  }
});

module.exports = { upload, ROOT };

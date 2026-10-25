const db = require('./database');

const BASE_LIMIT = 5;
const BONUS_PER_UPLOAD = 5;

function calculateQuota(userId, role) {
  if (role === 'admin' || role === 'teacher') {
    return {
      isUnlimited: true,
      remaining: Infinity,
      usedDownloads: 0,
      totalAllowed: Infinity,
      uploadsCount: 0
    };
  }

  const user = db.prepare('SELECT bonus_downloads FROM users WHERE id = ?').get(userId);
  const extraBonus = (user && user.bonus_downloads) || 0;

  const papersCount = db.prepare('SELECT COUNT(*) c FROM papers WHERE uploaded_by = ?').get(userId).c;
  const booksCount = db.prepare('SELECT COUNT(*) c FROM books WHERE uploaded_by = ?').get(userId).c;
  const uploadsCount = papersCount + booksCount;

  const totalAllowed = BASE_LIMIT + (uploadsCount * BONUS_PER_UPLOAD) + extraBonus;
  const usedDownloads = db.prepare(
    "SELECT COUNT(DISTINCT item_type || ':' || item_id) c FROM downloads WHERE user_id = ?"
  ).get(userId).c;

  const remaining = Math.max(0, totalAllowed - usedDownloads);

  return {
    isUnlimited: false,
    baseLimit: BASE_LIMIT,
    bonusPerUpload: BONUS_PER_UPLOAD,
    uploadsCount,
    totalAllowed,
    usedDownloads,
    remaining
  };
}

module.exports = {
  calculateQuota,
  BASE_LIMIT,
  BONUS_PER_UPLOAD
};

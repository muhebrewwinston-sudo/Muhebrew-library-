require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./database');

const args = process.argv.slice(2);
const samples = args.includes('--samples');
const [emailArg, passArg] = args.filter((a) => !a.startsWith('--'));

// ---- Admin account ----
if (!samples || emailArg) {
  const email = (emailArg || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) {
    console.log('Usage: npm run seed -- your@email.com YourPassword123');
    process.exit(samples ? 0 : 1);
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
    console.log('Account already existed - it is now an admin:', email);
  } else {
    let password = passArg || process.env.ADMIN_PASSWORD;
    let generated = false;
    if (!password) { password = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, 'x'); generated = true; }
    db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
      .run('Administrator', email, bcrypt.hashSync(password, 10), 'admin');
    console.log('Admin created:', email);
    if (generated) console.log('Password (shown once, write it down):', password);
  }
}

// ---- Official secondary school curriculum materials (real documents, Form 1 - 4 only) ----
if (samples) {
  try {
    const { generateOfficialDocuments } = require('../utils/generate_official_docs');
    const result = generateOfficialDocuments();
    console.log(`[Seed] Official curriculum documents initialized: ${result.papers.length} papers, ${result.books.length} textbooks.`);
  } catch (err) {
    console.warn('[Seed] Document generator notice:', err.message);
  }
}
console.log('Done.');

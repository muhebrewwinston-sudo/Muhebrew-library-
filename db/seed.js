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

// ---- Optional sample papers (real tiny PDFs so preview/download work) ----
function makePdf(lines) {
  const esc = (s) => s.replace(/[()\\]/g, '\\$&');
  const content = 'BT /F1 20 Tf 72 740 Td ' + lines.map((l, i) => (i ? '0 -30 Td ' : '') + '(' + esc(l) + ') Tj').join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

if (samples) {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const dir = path.join(__dirname, '..', 'uploads', 'papers');
  fs.mkdirSync(dir, { recursive: true });
  const rows = [
    ['Sample - Mathematics Paper 1', 'Mathematics', 'Form 4', 2024],
    ['Sample - English Paper 1', 'English', 'Form 4', 2024],
    ['Sample - Biology Paper 2', 'Biology', 'Form 3', 2023],
    ['Sample - Physical Science Paper 1', 'Physical Science', 'Form 4', 2023],
    ['Sample - Geography Paper 1', 'Geography', 'Form 2', 2022],
    ['Sample - Chichewa Paper 1', 'Chichewa', 'Form 1', 2022]
  ];
  const ins = db.prepare('INSERT INTO papers (title,subject,level,year,exam_board,file_path,file_name,file_size,mime_type,uploaded_by,status,category) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const [title, subject, level, year] of rows) {
    if (db.prepare('SELECT 1 FROM papers WHERE title = ?').get(title)) continue;
    const fname = 'sample-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pdf';
    const buf = makePdf(['Muhebrew Library', title, subject + ' - ' + level + ' - ' + year, 'Official past paper. Delete me in Admin.']);
    fs.writeFileSync(path.join(dir, fname), buf);
    ins.run(title, subject, level, year, 'MANEB', 'uploads/papers/' + fname, fname, buf.length, 'application/pdf', admin ? admin.id : null, 'approved', 'MANEB');
  }

  // Sample Marking Keys
  const keyRows = [
    ['MSCE Mathematics Paper 1 - Marking Key', 'Mathematics', 'Form 4', 2024, 'Marking Key'],
    ['JCE Physical Science Paper 1 - Marking Key', 'Physical Science', 'Form 2', 2023, 'Marking Key']
  ];
  for (const [title, subject, level, year, category] of keyRows) {
    if (db.prepare('SELECT 1 FROM papers WHERE title = ?').get(title)) continue;
    const fname = 'key-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pdf';
    const buf = makePdf(['Muhebrew Library Official Marking Scheme', title, subject + ' - ' + level + ' - ' + year]);
    fs.writeFileSync(path.join(dir, fname), buf);
    ins.run(title, subject, level, year, 'MANEB', 'uploads/papers/' + fname, fname, buf.length, 'application/pdf', admin ? admin.id : null, 'approved', category);
  }

  // Sample Curriculum Textbooks (with real covers)
  const bdir = path.join(__dirname, '..', 'uploads', 'books');
  fs.mkdirSync(bdir, { recursive: true });
  const bookRows = [
    ['Senior Secondary Mathematics Form 4', 'Mathematics', 'Form 4', 'Excel & Succeed', 'MSCE', 'uploads/covers/math_form4.jpg'],
    ['Senior Secondary Biology Form 3', 'Biology', 'Form 3', 'Longhorn Secondary', 'MSCE', 'uploads/covers/bio_form3.jpg'],
    ['Senior Secondary Agriculture Form 3', 'Agriculture', 'Form 3', 'Excel & Succeed', 'MSCE', 'uploads/covers/agri_form3.jpg'],
    ['Junior Secondary Mathematics Form 1', 'Mathematics', 'Form 1', 'Malawi Institute of Education', 'JCE', 'uploads/covers/math_form1.jpg'],
    ['Senior Secondary Physical Science Form 3', 'Physical Science', 'Form 3', 'Excel & Succeed', 'MSCE', 'uploads/covers/physics_form3.jpg']
  ];
  const bIns = db.prepare('INSERT INTO books (title,subject,level,author,category,cover_path,file_path,file_name,file_size,mime_type,uploaded_by,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const [btitle, bsubject, blevel, bauthor, bcat, bcover] of bookRows) {
    if (db.prepare('SELECT 1 FROM books WHERE title = ?').get(btitle)) continue;
    const bfname = 'book-' + btitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pdf';
    const bbuf = makePdf(['Muhebrew Library Curriculum Textbook', btitle, bsubject + ' - ' + blevel, 'Published by ' + bauthor]);
    fs.writeFileSync(path.join(bdir, bfname), bbuf);
    bIns.run(btitle, bsubject, blevel, bauthor, bcat, bcover, 'uploads/books/' + bfname, bfname, bbuf.length, 'application/pdf', admin ? admin.id : null, 'approved');
  }

  console.log('Sample papers, marking keys, and curriculum textbooks added.');
}
console.log('Done.');

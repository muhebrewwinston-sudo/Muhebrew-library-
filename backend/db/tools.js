// Small admin helper:  npm run admin -- <command> ...
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

const [cmd, a, b] = process.argv.slice(2);
const lower = (s) => String(s || '').trim().toLowerCase();

const help = `
Commands (run as: npm run admin -- <command>):
  list-users                          show all accounts
  make-admin   <email>                give admin rights
  make-teacher <email>                give teacher rights
  make-student <email>                make a normal student
  set-password <email> <newpassword>  reset a password
  set-email    <oldemail> <newemail>  change an email address
`;

function mustUser(email) {
  const u = db.prepare('SELECT id,email FROM users WHERE email = ?').get(lower(email));
  if (!u) { console.log('No account with email:', lower(email)); process.exit(1); }
  return u;
}

switch (cmd) {
  case 'list-users':
    console.table(db.prepare('SELECT id,email,role,name FROM users ORDER BY id').all());
    break;
  case 'make-admin': case 'make-teacher': case 'make-student': {
    const role = cmd.replace('make-', '');
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, mustUser(a).id);
    console.log(lower(a), 'is now', role);
    break;
  }
  case 'set-password': {
    if (!b || b.length < 6) { console.log('Password must be at least 6 characters.'); process.exit(1); }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(b, 10), mustUser(a).id);
    console.log('Password changed for', lower(a));
    break;
  }
  case 'set-email': {
    if (!b) { console.log(help); process.exit(1); }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(lower(b))) { console.log('That new email is already used.'); process.exit(1); }
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(lower(b), mustUser(a).id);
    console.log('Email changed to', lower(b));
    break;
  }
  default:
    console.log(help);
}

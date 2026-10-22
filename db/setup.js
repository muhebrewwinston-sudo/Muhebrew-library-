// Creates a .env file with a fresh random JWT secret (only if .env does not exist)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file)) {
  console.log('.env already exists - left unchanged.');
} else {
  fs.writeFileSync(file, [
    'PORT=3000',
    'JWT_SECRET=' + crypto.randomBytes(32).toString('hex'),
    'JWT_EXPIRES=30d',
    'DB_PATH=./db/pasthub.db',
    'MAX_UPLOAD_MB=40',
    ''
  ].join('\n'));
  console.log('Created .env with a new secret key.');
}
console.log('\nNext: npm run seed -- your@email.com YourPassword123');

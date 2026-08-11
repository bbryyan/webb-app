require('dotenv').config();
const { query } = require('./server/config/database');

async function fixCharset() {
  try {
    await query(`ALTER TABLE direct_messages CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await query(`ALTER TABLE direct_messages MODIFY message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL`);
    await query(`ALTER TABLE direct_messages MODIFY reaction VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL`);
    console.log('Successfully updated direct_messages to utf8mb4!');
  } catch(e) {
    console.error('Error:', e);
  }
  process.exit(0);
}

fixCharset();

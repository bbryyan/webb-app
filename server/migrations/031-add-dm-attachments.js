const { query } = require('../config/database');

async function up() {
  await query(`
    ALTER TABLE direct_messages 
    ADD COLUMN attachment_url VARCHAR(255) DEFAULT NULL,
    ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL,
    ADD COLUMN attachment_type VARCHAR(50) DEFAULT NULL;
  `);
  console.log('✅ attachment columns added to direct_messages');
}

module.exports = up;

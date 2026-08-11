const { query } = require('../config/database');

async function up() {
  await query(`
    ALTER TABLE direct_messages 
    ADD COLUMN reaction VARCHAR(10) DEFAULT NULL;
  `);
  console.log('✅ reaction column added to direct_messages');
}

module.exports = up;

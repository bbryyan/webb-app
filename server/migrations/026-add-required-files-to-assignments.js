const mysqlConfig = require('../config/database');

async function up() {
  console.log('Running migration 026-add-required-files-to-assignments...');
  try {
    const [result] = await mysqlConfig.query(`
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'assignments'
        AND COLUMN_NAME = 'required_files_count'
    `);
    
    // Wait, earlier I found db.query resolves to [rows, fields] but maybe not directly here if it's the custom db wrapper.
    // The custom db wrapper returns result directly or array?
    // Let me just try without array destructuring first because the mysqlConfig might return the array directly.
    const rows = Array.isArray(result) ? result : [result];
    const exists = rows.some(row => row && row.count > 0);
    
    if (!exists) {
      await mysqlConfig.query(`
        ALTER TABLE assignments 
        ADD COLUMN required_files_count INT DEFAULT 0
      `);
      console.log('✅ Added required_files_count column to assignments table');
    } else {
      console.log('⚠️ required_files_count column already exists in assignments table');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down() {
  console.log('Reverting migration 026-add-required-files-to-assignments...');
  try {
    await mysqlConfig.query(`
      ALTER TABLE assignments 
      DROP COLUMN required_files_count
    `);
    console.log('✅ Removed required_files_count column from assignments table');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

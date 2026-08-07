const { query } = require('../config/database');

async function up() {
  console.log('Running migration 027-add-required-file-count...');
  
  try {
    await query("ALTER TABLE assignments ADD COLUMN required_file_count INT NULL");
    console.log('Added required_file_count column to assignments table');
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    console.log('Column required_file_count already exists on assignments table');
  }
}

async function down() {
  await query('ALTER TABLE assignments DROP COLUMN required_file_count');
}

module.exports = { up, down };

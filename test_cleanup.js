const { query, closeDatabase } = require('./server/config/database');
const { cleanupOldDMAttachments } = require('./server/utils/dmCleanupScheduler');

async function test() {
  console.log('Testing DM cleanup...');
  // Force a message's created_at to 8 days ago
  await query('UPDATE direct_messages SET created_at = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE attachment_url IS NOT NULL LIMIT 1');
  
  // Run cleanup
  await cleanupOldDMAttachments();

  console.log('Done!');
  await closeDatabase();
}

test().catch(console.error);

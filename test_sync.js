const fs = require('fs');
const path = require('path');
const { query, closeDatabase } = require('./server/config/database');
const { networkDataPath } = require('./server/config/database');

async function triggerSync() {
  const targetDir = path.join(networkDataPath, 'teamleader', 'Lorie038', '03_2820DF');
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const dummyFilePath = path.join(targetDir, 'mock_sync_file.pdf');
  console.log('Writing file to trigger chokidar:', dummyFilePath);
  fs.writeFileSync(dummyFilePath, 'dummy pdf content for auto-sync test');

  // Wait 2 seconds for chokidar to catch it
  await new Promise(r => setTimeout(r, 2000));

  const rows = await query('SELECT * FROM assignment_attachments WHERE filename = ?', ['mock_sync_file.pdf']);
  if (rows && rows.length > 0) {
    console.log('✅ File was auto-synced to the DB!', rows[0]);
  } else {
    console.log('❌ File was NOT synced to DB. Check fileWatcher logs.');
  }

  // Cleanup
  fs.unlinkSync(dummyFilePath);
  console.log('Cleaned up dummy file.');
  await closeDatabase();
}

triggerSync().catch(console.error);

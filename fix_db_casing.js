const { query, closeDatabase } = require('./server/config/database');

async function fixFolderNames() {
  console.log('Fixing incorrectly cased testing! folder...');
  const result = await query(
    `UPDATE assignment_attachments SET folder_name = 'TESTING!' WHERE folder_name = 'testing!'`
  ).catch(e => {
    console.error('Error updating:', e);
  });
  
  console.log('Update result:', result);

  await closeDatabase();
}

fixFolderNames();

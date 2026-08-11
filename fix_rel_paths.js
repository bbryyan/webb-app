const { query, closeDatabase } = require('./server/config/database');

async function fixRelativePaths() {
  console.log('Fixing incorrectly generated relative paths...');
  
  // Find all records in TESTING!
  const records = await query(`SELECT id, relative_path, original_name FROM assignment_attachments WHERE folder_name = 'TESTING!'`);
  
  let fixedCount = 0;
  for (const row of records) {
    if (row.relative_path.startsWith('team.leader/')) {
      // It looks like team.leader/testing!/filename.ext
      const parts = row.relative_path.split('/');
      if (parts.length >= 3) {
        // parts[0] is team.leader
        // parts[1] is testing!
        // We want TESTING!/filename.ext (which means we use the exact db folder_name 'TESTING!' and the original_name)
        // Wait, original_name has original casing for the file.
        // Let's just do 'TESTING!/' + row.original_name
        // Unless it's in a subfolder. If parts.length > 3, it's in a subfolder.
        const newRelPathParts = parts.slice(1);
        newRelPathParts[0] = 'TESTING!';
        // Let's replace the last part with original_name to restore casing of the filename
        newRelPathParts[newRelPathParts.length - 1] = row.original_name;
        
        const newRelPath = newRelPathParts.join('/');
        
        await query(`UPDATE assignment_attachments SET relative_path = ? WHERE id = ?`, [newRelPath, row.id]);
        console.log(`Updated ID ${row.id}: ${row.relative_path} -> ${newRelPath}`);
        fixedCount++;
      }
    }
  }
  
  console.log(`Fixed ${fixedCount} relative paths.`);

  await closeDatabase();
}

fixRelativePaths();

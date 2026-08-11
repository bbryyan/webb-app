const { query, closeDatabase } = require('./server/config/database');

async function testQuery() {
  const result = await query(
    `SELECT original_name FROM assignment_attachments WHERE folder_name = ?`,
    ['testing!']
  ).catch(e => {
    console.error('Error querying:', e);
    return [];
  });
  
  console.log('Result for folder "testing!":', result);

  await closeDatabase();
}

testQuery();

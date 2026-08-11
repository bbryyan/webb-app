const { query, closeDatabase } = require('./server/config/database');

async function testQuery() {
  const result = await query(
    `SELECT id, filename, folder_name FROM assignment_attachments WHERE folder_name = ?`,
    ['testing!']
  ).catch(e => []);
  
  console.log('Result for "testing!":', result);

  await closeDatabase();
}

testQuery();

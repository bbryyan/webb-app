const { query, closeDatabase } = require('./server/config/database');

async function test() {
  const result = await query('SELECT * FROM assignment_attachments LIMIT 1');
  console.log(result);
  await closeDatabase();
}

test();

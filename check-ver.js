require('dotenv').config();
const { query } = require('./server/config/database');

async function checkVer() {
  try {
    const rows = await query(`SELECT VERSION() as v`);
    console.log('MySQL Version:', rows[0].v);
  } catch(e) {
    console.error('Error:', e);
  }
  process.exit(0);
}

checkVer();

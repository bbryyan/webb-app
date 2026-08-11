const { query } = require('../config/database');

async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      sender_id   INT NOT NULL,
      receiver_id INT NOT NULL,
      message     TEXT NOT NULL,
      is_read     TINYINT(1) NOT NULL DEFAULT 0,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dm_receiver   (receiver_id),
      INDEX idx_dm_sender     (sender_id),
      INDEX idx_dm_convo      (sender_id, receiver_id),
      INDEX idx_dm_unread     (receiver_id, is_read)
    )
  `);
  console.log('✅ direct_messages table created');
}

module.exports = up;

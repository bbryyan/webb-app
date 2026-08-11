const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const { uploadsDir } = require('../config/middleware');
const { logInfo, logError } = require('./logger');

async function cleanupOldDMAttachments() {
  logInfo('🧹 Starting 7-day DM attachment cleanup job...');
  try {
    // Find all attachments older than 7 days
    const oldMessages = await query(`
      SELECT id, attachment_url, message 
      FROM direct_messages 
      WHERE attachment_url IS NOT NULL 
        AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);

    if (!oldMessages || oldMessages.length === 0) {
      logInfo('✅ No old DM attachments found to clean up.');
      return;
    }

    let deletedCount = 0;

    for (const msg of oldMessages) {
      // 1. Delete physical file
      if (msg.attachment_url) {
        const filePath = path.join(uploadsDir, msg.attachment_url);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (fileErr) {
            logError(`Failed to delete file ${filePath}`, { error: fileErr });
          }
        }
      }

      // 2. Update DB
      let updateMsgQuery = `
        UPDATE direct_messages 
        SET attachment_url = NULL, attachment_name = NULL, attachment_type = NULL 
      `;
      let params = [];

      // If the message is completely empty without the attachment, put a placeholder
      if (!msg.message || msg.message.trim() === '') {
        updateMsgQuery += `, message = ? `;
        params.push('🚫 [Attachment automatically deleted after 7 days]');
      }

      updateMsgQuery += ` WHERE id = ?`;
      params.push(msg.id);

      await query(updateMsgQuery, params);
      deletedCount++;
    }

    logInfo(`✅ DM cleanup completed. Deleted ${deletedCount} attachments.`);
  } catch (error) {
    logError(error, { context: 'dm-cleanup-scheduler' });
  }
}

function scheduleDMCleanupJob() {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  setInterval(cleanupOldDMAttachments, ONE_DAY);
  
  // Also run it 5 minutes after startup to catch any missed days while server was off
  setTimeout(cleanupOldDMAttachments, 5 * 60 * 1000);
  
  logInfo('🕒 Scheduled daily DM attachment cleanup job.');
}

module.exports = {
  cleanupOldDMAttachments,
  scheduleDMCleanupJob
};

const { query, closeDatabase } = require('./server/config/database');
const fs = require('fs');
const path = require('path');

// MOCK watcher configuration
function norm(p) { return (p || '').replace(/\\/g, '/').toLowerCase().trim(); }
function relPart(p) {
  const n = norm(p);
  for (const seg of ['uploads/', 'user_approvals/', 'projects/', 'teamleader/']) {
    const idx = n.indexOf(seg);
    if (idx !== -1) return n.slice(idx + seg.length);
  }
  return n;
}

async function handleFileAddition(addedPath) {
  const fileName = path.basename(addedPath);
  const relAdded = relPart(addedPath);
  console.log('[DEBUG] fileName:', fileName);
  console.log('[DEBUG] relAdded:', relAdded);

  const normalizedAbs = norm(addedPath);
  if (!normalizedAbs.includes('/teamleader/')) {
    console.log('[DEBUG] Failed norm check:', normalizedAbs);
    return;
  }

  const parts = relAdded.split(/[\\/]/);
  if (parts.length < 3) {
    console.log('[DEBUG] Failed parts length:', parts.length, parts);
    return;
  }

  const teamLeaderUsername = parts[0];
  const folderName = parts[parts.length - 2];
  console.log('[DEBUG] Extracted username:', teamLeaderUsername, 'folderName:', folderName);

  const existing = await query(
    `SELECT assignment_id, uploaded_by_id FROM assignment_attachments WHERE folder_name = ? LIMIT 1`,
    [folderName]
  ).catch(e => {
    console.error('Query error:', e);
    return [];
  });
  console.log('[DEBUG] existing:', existing);

  if (existing && existing.length > 0) {
    const { assignment_id, uploaded_by_id } = existing[0];
    
    const existingFile = await query(
      `SELECT id FROM assignment_attachments WHERE assignment_id = ? AND original_name = ? AND folder_name = ?`,
      [assignment_id, fileName, folderName]
    );
    console.log('[DEBUG] existingFile:', existingFile);

    if (existingFile && existingFile.length === 0) {
      console.log('👀 New physical file detected. Auto-syncing...');
    } else {
      console.log('✅ File already exists in DB!');
    }
  } else {
    console.log('❌ No existing assignment found for folder:', folderName);
  }
}

async function run() {
  await handleFileAddition('\\\\KMTI-NAS\\Shared\\data\\teamleader\\team.leader\\TESTING!\\chapt1 (1).docx');
  await closeDatabase();
}

run();

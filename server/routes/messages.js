const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/database');
const { pushToUser } = require('./notifications');
const { upload, uploadsDir } = require('../config/middleware');
const fs = require('fs');
const path = require('path');

// Ensure DM uploads directory exists
const dmUploadsDir = path.join(uploadsDir, 'dm');
if (!fs.existsSync(dmUploadsDir)) {
  fs.mkdirSync(dmUploadsDir, { recursive: true });
}

// All routes require auth
router.use(authenticateToken);

// ── GET /api/messages/conversation/:otherUserId ────────────────────────────────
// Returns all messages between the current user and another user (newest last)
router.get('/conversation/:otherUserId', asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const otherId = parseInt(req.params.otherUserId, 10);

  if (!otherId || isNaN(otherId)) {
    return res.status(400).json({ success: false, message: 'Invalid user ID' });
  }

  const messages = await query(
    `SELECT
       dm.id, dm.sender_id, dm.receiver_id, dm.message, dm.is_read, dm.created_at, dm.reaction,
       dm.attachment_url, dm.attachment_name, dm.attachment_type,
       u.fullName AS sender_name, u.username AS sender_username, u.profile_picture AS sender_avatar
     FROM direct_messages dm
     JOIN users u ON u.id = dm.sender_id
     WHERE (dm.sender_id = ? AND dm.receiver_id = ?)
        OR (dm.sender_id = ? AND dm.receiver_id = ?)
     ORDER BY dm.created_at ASC
     LIMIT 200`,
    [myId, otherId, otherId, myId]
  );

  res.json({ success: true, messages });
}));

// ── POST /api/messages/upload ──────────────────────────────────────────────────
// Upload an attachment for a direct message
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const timestamp = Date.now();
  const safeOriginalName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${timestamp}_${safeOriginalName}`;
  const targetPath = path.join(dmUploadsDir, filename);

  // Move file from temp to final destination
  fs.copyFileSync(req.file.path, targetPath);
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    attachment: {
      url: `dm/${filename}`,
      name: req.file.originalname,
      type: req.file.mimetype
    }
  });
}));

// ── POST /api/messages/send ────────────────────────────────────────────────────
// Send a direct message to another user
router.post('/send', asyncHandler(async (req, res) => {
  const senderId = req.user.id;
  const { receiverId, message, attachmentUrl, attachmentName, attachmentType } = req.body;

  if (!receiverId || (!message && !attachmentUrl)) {
    return res.status(400).json({ success: false, message: 'receiverId and (message or attachment) are required' });
  }

  if (parseInt(receiverId, 10) === senderId) {
    return res.status(400).json({ success: false, message: 'Cannot message yourself' });
  }

  const trimmed = message ? message.trim().slice(0, 2000) : '';

  const result = await query(
    'INSERT INTO direct_messages (sender_id, receiver_id, message, attachment_url, attachment_name, attachment_type) VALUES (?, ?, ?, ?, ?, ?)',
    [senderId, receiverId, trimmed, attachmentUrl || null, attachmentName || null, attachmentType || null]
  );

  const messageId = result.insertId;

  // Fetch full message with sender info for the real-time payload
  const [newMsg] = await query(
    `SELECT dm.id, dm.sender_id, dm.receiver_id, dm.message, dm.is_read, dm.created_at, dm.reaction,
            dm.attachment_url, dm.attachment_name, dm.attachment_type,
            u.fullName AS sender_name, u.username AS sender_username, u.profile_picture AS sender_avatar
     FROM direct_messages dm
     JOIN users u ON u.id = dm.sender_id
     WHERE dm.id = ?`,
    [messageId]
  );

  // Push real-time notification to receiver via existing SSE system
  pushToUser(receiverId, {
    type: 'direct_message',
    message: newMsg
  });

  res.json({ success: true, message: newMsg });
}));

// ── PUT /api/messages/read/:otherUserId ───────────────────────────────────────
// Mark all messages FROM otherUser TO currentUser as read
router.put('/read/:otherUserId', asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const otherId = parseInt(req.params.otherUserId, 10);

  await query(
    'UPDATE direct_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
    [otherId, myId]
  );

  res.json({ success: true });
}));

// ── GET /api/messages/unread-count ────────────────────────────────────────────
// Returns total unread count + per-sender breakdown for badge display
router.get('/unread-count', asyncHandler(async (req, res) => {
  const myId = req.user.id;

  const rows = await query(
    `SELECT sender_id, COUNT(*) as count
     FROM direct_messages
     WHERE receiver_id = ? AND is_read = 0
     GROUP BY sender_id`,
    [myId]
  );

  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  const perSender = {};
  for (const r of rows) {
    perSender[String(r.sender_id)] = Number(r.count);
  }

  res.json({ success: true, total, perSender });
}));

// ── PUT /api/messages/react/:messageId ────────────────────────────────────────
// Add or update an emoji reaction on a message
router.put('/react/:messageId', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const messageId = parseInt(req.params.messageId, 10);
  const { emoji } = req.body;

  if (!messageId || isNaN(messageId)) {
    return res.status(400).json({ success: false, message: 'Invalid message ID' });
  }

  // Ensure the user is either the sender or receiver of the message
  const [msgRow] = await query(
    'SELECT sender_id, receiver_id FROM direct_messages WHERE id = ?',
    [messageId]
  );

  if (!msgRow) {
    return res.status(404).json({ success: false, message: 'Message not found' });
  }

  if (msgRow.sender_id !== userId && msgRow.receiver_id !== userId) {
    return res.status(403).json({ success: false, message: 'Not authorized to react to this message' });
  }

  const reactionValue = emoji ? emoji.trim().slice(0, 10) : null;

  await query(
    'UPDATE direct_messages SET reaction = ? WHERE id = ?',
    [reactionValue, messageId]
  );

  // Notify both the sender and receiver via SSE
  const payload = {
    type: 'direct_message_reaction',
    messageId,
    reaction: reactionValue,
    userId
  };

  pushToUser(msgRow.sender_id, payload);
  if (msgRow.sender_id !== msgRow.receiver_id) {
    pushToUser(msgRow.receiver_id, payload);
  }

  res.json({ success: true, reaction: reactionValue });
}));

module.exports = router;

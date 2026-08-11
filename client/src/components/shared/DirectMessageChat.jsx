import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '@/config/api'
import Avatar from './Avatar'
import './DirectMessageChat.css'

const X_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const SEND_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

/**
 * Format a timestamp into a human-readable time string (e.g. "9:42 AM")
 */
const formatTime = (isoString) => {
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// ── Emoji Encoder for older MySQL versions (utf8 vs utf8mb4) ─────────
const encodeEmojis = (str) => {
  if (!str) return str;
  return str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, match => encodeURIComponent(match));
}

const decodeEmojis = (str) => {
  if (!str) return str;
  return str.replace(/(%[0-9A-F]{2})+/ig, match => {
    try {
      return decodeURIComponent(match);
    } catch {
      return match;
    }
  });
}

/**
 * Format a timestamp into a date label (e.g. "Today", "Yesterday", "Aug 9")
 */
function formatDateLabel(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * DirectMessageChat
 * Props:
 *   currentUser  — logged-in user object { id, fullName, username, ... }
 *   targetUser   — user to chat with { userId, fullName, username, online, profile_picture, ... }
 *   onClose      — callback when chat window is closed
 *   onNewMessage — callback(senderId) when an incoming real-time message arrives (to update badge)
 */
const DirectMessageChat = ({ currentUser, targetUser, onClose, onNewMessage }) => {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // ── Fetch conversation history ─────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/messages/conversation/${targetUser.userId}`)
      if (data.success) {
        setMessages(data.messages || [])
      }
    } catch { }
    finally { setLoading(false) }
  }, [targetUser.userId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Mark messages as read when the window opens
  useEffect(() => {
    apiFetch(`/api/messages/read/${targetUser.userId}`, { method: 'PUT' }).catch(() => { })
  }, [targetUser.userId])

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // ── Listen for incoming real-time messages via notification SSE ─────────
  // The notifications SSE dispatches a custom event 'direct_message' onto window
  useEffect(() => {
    const handler = (e) => {
      const { type, message, messageId, reaction } = e.detail || {}
      
      if (type === 'direct_message_reaction') {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reaction } : m))
        return
      }

      if (type !== 'direct_message' || !message) return

      const isFromTarget = String(message.sender_id) === String(targetUser.userId)
      const isToMe = String(message.receiver_id) === String(currentUser.id)

      if (isFromTarget && isToMe) {
        setMessages(prev => [...prev, message])
        // Mark as read immediately since this chat is open
        apiFetch(`/api/messages/read/${targetUser.userId}`, { method: 'PUT' }).catch(() => { })
      }
    }
    window.addEventListener('dm:incoming', handler)
    return () => window.removeEventListener('dm:incoming', handler)
  }, [targetUser.userId, currentUser.id])

  // ── Send a message ────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text || sending) return

    setSending(true)
    setInputValue('')

    // Optimistic UI — add message immediately
    const optimistic = {
      id: `opt-${Date.now()}`,
      sender_id: currentUser.id,
      receiver_id: targetUser.userId,
      message: text,
      is_read: 0,
      created_at: new Date().toISOString(),
      sender_name: currentUser.fullName || currentUser.username,
      sender_username: currentUser.username,
      sender_avatar: currentUser.profile_picture || null,
      _optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const data = await apiFetch('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({ receiverId: targetUser.userId, message: encodeEmojis(text) })
      })
      if (data.success) {
        // Replace optimistic with real message from server
        setMessages(prev => prev.map(m => m.id === optimistic.id ? data.message : m))
      }
    } catch {
      // Remove optimistic on failure
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setInputValue(text) // restore text
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [inputValue, sending, currentUser, targetUser.userId])

  // ── Keyboard: Enter to send, Shift+Enter for newline ─────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Auto-resize textarea ──────────────────────────────────────────────
  const handleInput = (e) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }

  // ── React to message ──────────────────────────────────────────────────
  const handleReact = async (messageId, emoji) => {
    // Optimistically update
    const prevMessages = [...messages]
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reaction: emoji } : m))
    
    try {
      await apiFetch(`/api/messages/react/${messageId}`, {
        method: 'PUT',
        body: JSON.stringify({ emoji: encodeEmojis(emoji) })
      })
    } catch {
      // Revert on failure
      setMessages(prevMessages)
    }
  }

  // ── Group messages by date and consecutive sender ─────────────────────
  const renderMessages = () => {
    if (loading) {
      return (
        <div className="dm-loading">
          <div className="dm-spinner" />
          Loading...
        </div>
      )
    }

    if (messages.length === 0) {
      return (
        <div className="dm-empty">
          <span className="dm-empty-icon">💬</span>
          <span>No messages yet.<br />Say hi to {targetUser.fullName || targetUser.username}!</span>
        </div>
      )
    }

    const items = []
    let lastDateLabel = ''
    let lastSenderId = null

    messages.forEach((msg, idx) => {
      const dateLabel = formatDateLabel(msg.created_at)
      const isMine = String(msg.sender_id) === String(currentUser.id)
      const isFirstInGroup = lastSenderId !== String(msg.sender_id) || dateLabel !== lastDateLabel
      
      const isLastInGroup = !messages[idx + 1] || 
                            String(messages[idx + 1].sender_id) !== String(msg.sender_id) || 
                            formatDateLabel(messages[idx + 1].created_at) !== dateLabel

      // Date divider
      if (dateLabel !== lastDateLabel) {
        lastDateLabel = dateLabel
        items.push(
          <div key={`date-${idx}`} className="dm-date-divider">{dateLabel}</div>
        )
      }

      items.push(
        <div key={msg.id} className={`dm-msg-group ${isMine ? 'mine' : 'theirs'} ${isFirstInGroup ? 'first' : ''} ${isLastInGroup ? 'last' : ''}`}>
          {!isMine && (
            <div className="dm-msg-avatar">
              {isFirstInGroup ? (
                <Avatar user={{ fullName: msg.sender_name, username: msg.sender_username, profile_picture: msg.sender_avatar }} size="xs" />
              ) : null}
            </div>
          )}
          <div className="dm-msg-content">
            <div className="dm-bubble-wrapper">
              <div className="dm-bubble">
                {decodeEmojis(msg.message)}
                {msg.reaction && (
                  <div className="dm-reaction-badge" onClick={() => handleReact(msg.id, null)}>
                    {decodeEmojis(msg.reaction)}
                  </div>
                )}
              </div>
              <div className="dm-reaction-menu">
                {['👍', '❤️', '😂', '😮', '😢', '😡'].map(emoji => (
                  <button key={emoji} onClick={() => handleReact(msg.id, emoji)}>{emoji}</button>
                ))}
              </div>
            </div>
            {isLastInGroup && <div className="dm-msg-time">{formatTime(msg.created_at)}</div>}
          </div>
        </div>
      )
      
      lastSenderId = String(msg.sender_id)
    })

    return items
  }

  return createPortal(
    <div className="dm-overlay">
      <div className="dm-window">
        {/* Header */}
        <div className="dm-header">
          <div className="dm-header-avatar">
            <Avatar user={targetUser} size="sm" />
            <span
              className="dm-status-dot"
              style={{ background: targetUser.online ? '#22c55e' : 'var(--text-tertiary, #9ca3af)' }}
            />
          </div>
          <div className="dm-header-info">
            <div className="dm-header-name">{targetUser.fullName || targetUser.username}</div>
            <div className="dm-header-status">
              <span style={{
                width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                background: targetUser.online ? '#22c55e' : 'var(--text-tertiary, #9ca3af)'
              }} />
              {targetUser.online ? 'Active now' : 'Offline'}
            </div>
          </div>
          <button
            className="dm-close-btn"
            onClick={onClose}
            title="Close chat"
            aria-label="Close chat"
          >
            {X_ICON}
          </button>
        </div>

        {/* Messages */}
        <div className="dm-messages">
          {renderMessages()}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="dm-input-area">
          <textarea
            ref={inputRef}
            className="dm-input"
            placeholder={`Message ${targetUser.fullName?.split(' ')[0] || targetUser.username}…`}
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={2000}
            disabled={sending}
          />
          <button
            className="dm-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            title="Send message"
            aria-label="Send message"
          >
            {SEND_ICON}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default DirectMessageChat

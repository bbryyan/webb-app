import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch, API_BASE_URL } from '@/config/api'
import useStore from '../../store/useStore'
import Avatar from './Avatar'
import DirectMessageChat from './DirectMessageChat'

const PING_INTERVAL = 30000 // 30s heartbeat
const MEMBERS_REFRESH_INTERVAL = 60000 // refresh full member list every 60s
const UNREAD_POLL_INTERVAL = 30000 // poll unread DM count every 30s

const getInitials = (name) => {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = [
  '#7c3aed', 'var(--status-review-text)', 'var(--status-approved-text)', 'var(--status-rejected-text)',
  'var(--status-pending-text)', 'var(--status-review-text)', '#be185d', 'var(--status-review-text)'
]

const getAvatarColor = (name = '') => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/**
 * OnlineMembersPanel
 * Shows ALL team members with real-time online/offline status via SSE.
 * Click any member to open a DirectMessage chat window.
 */
const OnlineMembersPanel = ({ user, teamFilter }) => {
  const [open, setOpen] = useState(false)
  const [allMembers, setAllMembers] = useState([])
  const onlineIdsRef = useRef(new Set())
  const [, forceUpdate] = useState(0)
  const [connected, setConnected] = useState(false)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 })
  const esRef = useRef(null)
  const reconnectTimer = useRef(null)

  // ── Direct message state ───────────────────────────────────────────────
  const [chatTarget, setChatTarget] = useState(null) // member being chatted with
  const [unreadPerSender, setUnreadPerSender] = useState({}) // { userId: count }
  const totalUnread = Object.values(unreadPerSender).reduce((a, b) => a + b, 0)

  // ── Fetch unread DM counts ─────────────────────────────────────────────
  const fetchUnreadCounts = useCallback(async () => {
    const { token } = useStore.getState()
    if (!user?.id || !token) return
    try {
      const data = await apiFetch('/api/messages/unread-count')
      if (data.success) setUnreadPerSender(data.perSender || {})
    } catch { }
  }, [user])

  // ── Fetch all members from DB with current online status ──────────────────────
  const fetchMembers = useCallback(async () => {
    const { token } = useStore.getState()
    if (!user?.id || !token) return  // don't fire before auth is ready
    try {
      const data = await apiFetch(`/api/presence/members`)
      if (data.success) {
        setAllMembers(data.members || [])
        const ids = new Set((data.members || []).filter(m => m.online).map(m => m.userId))
        onlineIdsRef.current = ids
        forceUpdate(n => n + 1)
      }
    } catch { }
  }, [user])

  // ── Heartbeat ping ────────────────────────────────────────────────────────
  const ping = useCallback(async () => {
    const { token } = useStore.getState()
    if (!user?.id || !token) return  // don't fire before auth is ready
    try {
      await apiFetch('/api/presence/ping', {
        method: 'POST',
        body: JSON.stringify({ team: user.team || teamFilter || null })
      })
    } catch { }
  }, [user, teamFilter])

  // ── SSE connection ────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (!user?.id) return
    const { token } = useStore.getState()
    const url = `${API_BASE_URL}/api/presence/stream${token ? `?token=${token}` : ''}`

    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      ping()
    }

    es.onmessage = (event) => {
      if (!event.data || event.data === 'ping') return
      try {
        const { online } = JSON.parse(event.data)
        const ids = new Set(
          (online || []).map(u => u.userId)
        )
        onlineIdsRef.current = ids
        setAllMembers(prev => {
          const updated = prev.map(m => ({ ...m, online: ids.has(m.userId) }))
          updated.sort((a, b) => {
            if (a.online !== b.online) return a.online ? -1 : 1
            return (a.fullName || a.username).localeCompare(b.fullName || b.username)
          })
          return updated
        })
      } catch { }
    }

    es.onerror = () => {
      setConnected(false)
      es.close()
      reconnectTimer.current = setTimeout(connectSSE, 5000)
    }
  }, [user, teamFilter, ping])

  // Init: ping → fetch members → connect SSE → fetch unread DMs
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const init = async () => {
      await ping()
      await fetchMembers()
      await fetchUnreadCounts()
      if (!cancelled) connectSSE()
    }
    init()

    const handleUnload = () => {
      const { token } = useStore.getState()
      if (token) {
        navigator.sendBeacon(
          `${API_BASE_URL}/api/presence/ping?_method=DELETE&token=${token}`,
          new Blob([], { type: 'application/json' })
        )
      }
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', handleUnload)
      if (esRef.current) esRef.current.close()
      clearTimeout(reconnectTimer.current)
      const { token } = useStore.getState()
      if (token) {
        apiFetch('/api/presence/ping', { method: 'DELETE' }).catch(() => { })
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat ping every 30s
  useEffect(() => {
    const interval = setInterval(ping, PING_INTERVAL)
    return () => clearInterval(interval)
  }, [ping])

  // Refresh full member list every 60s
  useEffect(() => {
    const interval = setInterval(fetchMembers, MEMBERS_REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchMembers])

  // Poll unread DM count every 30s
  useEffect(() => {
    const interval = setInterval(fetchUnreadCounts, UNREAD_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchUnreadCounts])

  // Listen for incoming real-time DMs — auto-open chat window for sender
  useEffect(() => {
    const handler = (e) => {
      const { type, message } = e.detail || {}
      if (type !== 'direct_message' || !message) return

      const senderId = String(message.sender_id)
      const isAlreadyOpen = chatTarget && String(chatTarget.userId) === senderId

      if (!isAlreadyOpen) {
        // Find the sender in the members list and auto-open chat
        const sender = allMembers.find(m => String(m.userId) === senderId)
        if (sender) {
          setChatTarget(sender)
          // Mark as read immediately since we're opening the window
          apiFetch(`/api/messages/read/${senderId}`, { method: 'PUT' }).catch(() => { })
        } else {
          // Sender not in list yet — just update badge
          setUnreadPerSender(prev => ({
            ...prev,
            [senderId]: (prev[senderId] || 0) + 1
          }))
        }
      }
      // If chat is already open with this sender, DirectMessageChat handles the message itself
    }
    window.addEventListener('dm:incoming', handler)
    return () => window.removeEventListener('dm:incoming', handler)
  }, [chatTarget, allMembers])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handleOutside = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const handleToggle = () => {
    setOpen(v => !v)
  }

  // Recalculate panel position after button expands
  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPanelPos({
        top: rect.bottom + window.scrollY + 12,
        right: window.innerWidth - rect.right,
      })
    }
  }, [open])

  // Open chat with a member
  const handleMemberClick = (member) => {
    if (String(member.userId) === String(user?.id)) return // can't message yourself
    setChatTarget(member)
    setOpen(false)
    // Clear unread badge for this sender
    setUnreadPerSender(prev => {
      const next = { ...prev }
      delete next[String(member.userId)]
      return next
    })
    // Mark messages as read on the server
    apiFetch(`/api/messages/read/${member.userId}`, { method: 'PUT' }).catch(() => { })
  }

  const onlineCount = allMembers.filter(m => m.online).length
  const totalCount = allMembers.length

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger Button */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Online Members"
        style={{
          display: 'flex', alignItems: 'center', gap: open ? '8px' : '0',
          background: open ? 'var(--status-approved)' : 'transparent',
          border: open ? '1.5px solid #86efac' : 'none',
          borderRadius: '999px',
          padding: open ? '5px 12px 5px 6px' : '0',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: open ? '0 0 0 3px #bbf7d040' : 'none',
          position: 'relative',
        }}
      >
        {/* Avatar with status dot */}
        <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <div style={{
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: open ? 'none' : '0 0 0 2px #e5e7eb',
            transition: 'box-shadow 0.2s',
            borderRadius: '50%'
          }}>
            <Avatar user={user} size="sm" />
          </div>
          <span style={{
            position: 'absolute', bottom: '-2px', right: '-2px',
            width: '10px', height: '10px', borderRadius: '50%',
            background: connected ? '#22c55e' : 'var(--text-tertiary)',
            border: '2px solid #fff',
            transition: 'background 0.3s',
            zIndex: 1
          }} />
        </div>
        {/* Name + status — only when open */}
        {open && (
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {user?.fullName || user?.username}
            </div>
            <div style={{ fontSize: '10.5px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px', color: connected ? 'var(--status-approved-text)' : 'var(--text-tertiary)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#22c55e' : 'var(--text-tertiary)', display: 'inline-block', transition: 'background 0.3s' }} />
              {connected ? 'Online' : 'Connecting...'}
            </div>
          </div>
        )}
        {/* Unread DM badge */}
        {totalUnread > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            minWidth: '16px',
            height: '16px',
            borderRadius: '999px',
            background: '#ef4444',
            color: '#fff',
            fontSize: '10px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            border: '2px solid #fff',
            pointerEvents: 'none',
            animation: 'dmBadgePop 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: `${panelPos.top}px`,
            right: `${panelPos.right}px`,
            zIndex: 99999,
            background: 'var(--background-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
            minWidth: '260px',
            maxWidth: '300px',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid var(--background-secondary)',
            display: 'flex', alignItems: 'center', gap: '7px'
          }}>
            {/* Pulsing green dot */}
            <span style={{ position: 'relative', display: 'inline-flex', width: '10px', height: '10px', flexShrink: 0 }}>
              <span style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: '#22c55e', opacity: 0.4,
                animation: 'presencePulse 1.8s ease-in-out infinite'
              }} />
              <span style={{ position: 'relative', width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
            </span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
              Online Members ({onlineCount}/{totalCount})
            </span>
            {/* Live indicator */}
            <span style={{
              marginLeft: 'auto', fontSize: '9.5px', fontWeight: '700',
              color: 'var(--status-approved-text)', background: 'var(--status-approved)',
              padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.3px'
            }}>LIVE</span>
          </div>

          {/* Members list */}
          <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '8px 0' }}>
            {allMembers.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No members found
              </div>
            ) : (
              allMembers.map((member) => {
                const isMe = member.userId === String(user?.id)
                const unreadCount = unreadPerSender[String(member.userId)] || 0
                return (
                  <div
                    key={member.userId}
                    onClick={() => handleMemberClick(member)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 16px',
                      background: isMe ? 'var(--status-approved)' : 'transparent',
                      opacity: member.online ? 1 : 0.65,
                      transition: 'background 0.1s',
                      cursor: isMe ? 'default' : 'pointer',
                      position: 'relative',
                    }}
                    onMouseEnter={e => {
                      if (!isMe) e.currentTarget.style.background = 'var(--background-tertiary, rgba(0,0,0,0.05))'
                    }}
                    onMouseLeave={e => {
                      if (!isMe) e.currentTarget.style.background = 'transparent'
                    }}
                    title={isMe ? '' : `Message ${member.fullName || member.username}`}
                  >
                    {/* Avatar + status dot */}
                    <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <div style={{ background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Avatar user={member} size="sm" />
                      </div>
                      <span style={{
                        position: 'absolute', bottom: '-2px', right: '-2px',
                        width: '10px', height: '10px', borderRadius: '50%',
                        background: member.online ? '#22c55e' : 'var(--text-tertiary)',
                        border: '2px solid #fff',
                        transition: 'background 0.3s',
                        zIndex: 1
                      }} />
                    </div>

                    {/* Name + status */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '5px'
                      }}>
                        {member.fullName || member.username}
                        {isMe && (
                          <span style={{
                            fontSize: '9.5px', fontWeight: '600', color: 'var(--status-approved-text)',
                            background: 'var(--status-approved)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0
                          }}>You</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: member.online ? 'var(--status-approved-text)' : 'var(--text-tertiary)',
                        fontWeight: '500',
                        display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px'
                      }}>
                        <span style={{
                          width: '5px', height: '5px', borderRadius: '50%',
                          background: member.online ? '#22c55e' : 'var(--text-tertiary)',
                          display: 'inline-block'
                        }} />
                        {member.online ? 'Active now' : 'Offline'}
                      </div>
                    </div>

                    {/* Unread DM badge for this member */}
                    {!isMe && unreadCount > 0 && (
                      <span style={{
                        minWidth: '18px',
                        height: '18px',
                        borderRadius: '999px',
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 5px',
                        flexShrink: 0,
                      }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}

                    {/* Message icon hint for non-self members */}
                    {!isMe && unreadCount === 0 && (
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '26px', height: '26px', borderRadius: '8px',
                        color: '#6d28d9',
                        background: 'rgba(109,40,217,0.10)',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Direct Message Chat Window */}
      {chatTarget && (
        <DirectMessageChat
          currentUser={user}
          targetUser={chatTarget}
          onClose={() => setChatTarget(null)}
        />
      )}

      {/* Animations */}
      <style>{`
        @keyframes presencePulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2); opacity: 0; }
        }
        @keyframes dmBadgePop {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default OnlineMembersPanel

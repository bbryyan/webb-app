import { useState, useEffect, useRef } from 'react';
import { apiFetch, API_BASE_URL } from '@/config/api';
import './css/NotificationBell.css';
import { useTaskbarFlash } from '../../utils/useTaskbarFlash';

const NotificationBell = ({ userId, onNotificationClick, refreshTrigger }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const unreadCountRef = useRef(0);

  // Enable taskbar flashing for new notifications
  useTaskbarFlash(unreadCount);

  const fetchUnreadCount = async () => {
    try {
      const data = await apiFetch(`/api/notifications/user/${userId}/unread-count?panelType=teamleader`);

      if (data.success) {
        const newCount = data.count || 0;
        if (newCount > unreadCountRef.current) {
          setPulse(true);
          setTimeout(() => setPulse(false), 1000);
        }
        unreadCountRef.current = newCount;
        setUnreadCount(newCount);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  useEffect(() => {
    if (!userId) return;
    fetchUnreadCount();
  }, [userId]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchUnreadCount();
    }
  }, [refreshTrigger]);

  return (
    <button
      className={`tl-notification-bell ${pulse ? 'pulse' : ''}`}
      onClick={onNotificationClick}
      title="Notifications"
    >
      <span className="tl-bell-icon">🔔</span>
      {unreadCount > 0 && (
        <span className="tl-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </button>
  );
};

export default NotificationBell;

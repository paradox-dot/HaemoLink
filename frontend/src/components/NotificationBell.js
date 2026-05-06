import React, { useState, useEffect, useRef } from 'react';
import { authFetch } from '../services/api';

const typeToTab = (type, entity_type) => {
  switch (type) {
    case 'expiry_alert':    return 'inventory';
    case 'match_found':     return 'matching';
    case 'transfer_update': return 'transfer';
    case 'sla_breach':      return 'transfer';
    case 'approval_pending':
      if (entity_type === 'USER') return 'users';
      if (entity_type === 'INSTITUTION') return 'institutions';
      return null;
    default:                return null;
  }
};

function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);

  const fetchCount = async () => {
    try {
      const res = await authFetch('/notification/count');
      const data = await res.json();
      setUnreadCount(data.count || 0);
    } catch {}
  };

  const fetchNotifications = async () => {
    try {
      const res = await authFetch('/notification');
      const data = await res.json();
      setNotifications(data);
    } catch {}
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60000); // poll every 60s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id) => {
    await authFetch(`/notification/${id}/read`, { method: 'PUT' });
    setNotifications(prev => prev.map(n => n.notification_id === id ? { ...n, status: 'read' } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await authFetch('/notification/read-all', { method: 'PUT' });
    setNotifications(prev => prev.map(n => ({ ...n, status: 'read' })));
    setUnreadCount(0);
  };

  const typeIcon = (type) => {
    const icons = {
      expiry_alert: '\u23F0',
      match_found: '\u{1F517}',
      transfer_update: '\u{1F69A}',
      approval_pending: '\u{1F3E5}',
      sla_breach: '\u26A0\uFE0F'
    };
    return icons[type] || '\u{1F514}';
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 6,
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', fontSize: 16
        }}
        title="Notifications"
      >
        {'\u{1F514}'}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#e74c3c', color: '#fff', fontSize: 9,
            width: 18, height: 18, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, border: '2px solid #96281b'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 360,
          background: '#fff', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          border: '1px solid #e0d6d3', zIndex: 200, maxHeight: 420, display: 'flex', flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #eee',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#2c2c2c' }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ fontSize: 11, color: '#3498db', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                No notifications
              </div>
            ) : (
              notifications.map(n => {
                const tab = typeToTab(n.type, n.entity_type);
                const clickable = tab != null;
                return (
                <div
                  key={n.notification_id}
                  onClick={() => {
                    if (n.status === 'unread') markRead(n.notification_id);
                    if (clickable && onNavigate) {
                      onNavigate(tab);
                      setOpen(false);
                    }
                  }}
                  style={{
                    padding: '10px 16px', borderBottom: '1px solid #f5f5f5',
                    background: n.status === 'unread' ? '#fdf8f7' : '#fff',
                    cursor: clickable ? 'pointer' : 'default',
                    display: 'flex', gap: 10, alignItems: 'flex-start'
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>{typeIcon(n.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: clickable ? '#96281b' : '#2c2c2c', lineHeight: 1.4, textDecoration: clickable ? 'underline' : 'none', textDecorationStyle: 'dotted' }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  {n.status === 'unread' && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c0392b', flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;

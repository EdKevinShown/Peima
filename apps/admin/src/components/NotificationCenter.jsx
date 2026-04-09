/**
 * P5 Phase 2.3: 通知中心组件
 * 显示在 Admin 侧边栏底部，包含铃铛图标、未读徽章、通知面板
 */

import { useState, useRef, useEffect } from 'react';
import '../styles/notification-center.css';

export function NotificationCenter({
  notifications,
  unreadCount,
  isConnected,
  onMarkAsRead,
  onMarkAllAsRead,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  // 点击外部关闭面板
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function getTypeIcon(type) {
    switch (type) {
      case 'role_change': return '🔐';
      case 'suggestion_update': return '📋';
      case 'audit_alert': return '⚠️';
      case 'system_message': return '📢';
      default: return '🔔';
    }
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  }

  return (
    <div className="notification-center" ref={panelRef}>
      <button
        className="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        title="通知中心"
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
      </button>

      {isOpen && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <h3>通知</h3>
            {unreadCount > 0 && (
              <button
                className="mark-all-read-btn"
                onClick={() => {
                  onMarkAllAsRead();
                }}
              >
                全部已读
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">暂无通知</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notification-item ${n.read ? '' : 'unread'}`}
                  onClick={() => {
                    if (!n.read) onMarkAsRead(n.id);
                  }}
                >
                  <span className="notification-type-icon">
                    {getTypeIcon(n.type)}
                  </span>
                  <div className="notification-content">
                    <div className="notification-title">{n.title}</div>
                    <div className="notification-message">{n.message}</div>
                    <div className="notification-time">
                      {n.createdAt ? timeAgo(n.createdAt) : ''}
                    </div>
                  </div>
                  {!n.read && <span className="unread-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

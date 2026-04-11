/**
 * P5 Phase 2.3: WebSocket 通知 Hook
 * 管理 Socket.io 连接、实时通知接收、未读计数
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { notificationsAPI } from '../api/notifications';

const WS_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [toastQueue, setToastQueue] = useState([]);
  const socketRef = useRef(null);

  // 建立 WebSocket 连接
  useEffect(() => {
    const token = localStorage.getItem('peimaToken');
    if (!token) return;

    const socket = io(`${WS_BASE}/notifications`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // 收到未读计数更新
    socket.on('notification:count', (data) => {
      setUnreadCount(data.unreadCount);
    });

    // 收到新通知
    socket.on('notification:new', (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
      setToastQueue((prev) => [...prev, notification]);
    });

    // 收到角色活动广播（管理员）
    socket.on('notification:role_activity', (data) => {
      setToastQueue((prev) => [
        ...prev,
        {
          type: 'role_change',
          title: '角色变更',
          message: `用户 ${data.userId} 的角色 ${data.roleCode} 已${data.action === 'assigned' ? '分配' : '撤销'}`,
        },
      ]);
    });

    // 收到审计告警
    socket.on('notification:audit_alert', (data) => {
      setToastQueue((prev) => [
        ...prev,
        {
          type: 'audit_alert',
          title: '审计告警',
          message: `操作 ${data.action} 在 ${data.entityType} 上触发告警`,
        },
      ]);
    });

    // 初始加载通知列表
    notificationsAPI.list({ limit: 10 }).then((result) => {
      if (result?.data) {
        setNotifications(result.data);
      }
    });

    notificationsAPI.getUnreadCount().then((result) => {
      if (result?.unreadCount !== undefined) {
        setUnreadCount(result.unreadCount);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // 标记单条已读
  const markAsRead = useCallback(async (notificationId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('notifications:mark_read', { notificationId });
    }
    await notificationsAPI.markAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // 全部标记已读
  const markAllAsRead = useCallback(async () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('notifications:mark_all_read');
    }
    await notificationsAPI.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  // 移除 toast
  const dismissToast = useCallback((index) => {
    setToastQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    notifications,
    unreadCount,
    isConnected,
    toastQueue,
    markAsRead,
    markAllAsRead,
    dismissToast,
  };
}

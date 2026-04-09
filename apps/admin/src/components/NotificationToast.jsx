/**
 * P5 Phase 2.3: Toast 通知组件
 * 新通知到达时的浮动提示，5秒后自动消失
 */

import { useEffect } from 'react';
import '../styles/notification-center.css';

export function NotificationToast({ toastQueue, onDismiss }) {
  return (
    <div className="toast-container">
      {toastQueue.map((toast, index) => (
        <ToastItem
          key={`${toast.id || index}-${index}`}
          toast={toast}
          onDismiss={() => onDismiss(index)}
        />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  function getTypeColor(type) {
    switch (type) {
      case 'role_change': return '#3b82f6';
      case 'suggestion_update': return '#10b981';
      case 'audit_alert': return '#f59e0b';
      case 'system_message': return '#8b5cf6';
      default: return '#6b7280';
    }
  }

  return (
    <div
      className="toast-item"
      style={{ borderLeftColor: getTypeColor(toast.type) }}
      onClick={onDismiss}
    >
      <div className="toast-title">{toast.title}</div>
      <div className="toast-message">{toast.message}</div>
    </div>
  );
}

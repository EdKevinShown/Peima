import { useState } from 'react';
import { SuggestionCenterPage } from './pages/SuggestionCenterPage';
import { RbacPermissionManager } from './pages/RbacPermissionManager';
import AuditLogPage from './pages/AuditLogPage';
import AnalyticsDashboardPage from './pages/AnalyticsDashboardPage';
import { NotificationCenter } from './components/NotificationCenter';
import { NotificationToast } from './components/NotificationToast';
import { useNotifications } from './hooks/useNotifications';
import './styles/admin-layout.css';

export default function App() {
  const [activePage, setActivePage] = useState('suggestions');
  const {
    notifications,
    unreadCount,
    isConnected,
    toastQueue,
    markAsRead,
    markAllAsRead,
    dismissToast,
  } = useNotifications();

  return (
    <div className="admin-layout">
      {/* 侧边栏菜单 */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <h2>⚙️ 管理后台</h2>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activePage === 'suggestions' ? 'active' : ''}`}
            onClick={() => setActivePage('suggestions')}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">建议中心</span>
          </button>
          <button
            className={`nav-item ${activePage === 'permissions' ? 'active' : ''}`}
            onClick={() => setActivePage('permissions')}
          >
            <span className="nav-icon">🔐</span>
            <span className="nav-label">权限管理</span>
          </button>
          <button
            className={`nav-item ${activePage === 'audit-logs' ? 'active' : ''}`}
            onClick={() => setActivePage('audit-logs')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">审计日志</span>
          </button>
          <button
            className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActivePage('dashboard')}
          >
            <span className="nav-icon">📈</span>
            <span className="nav-label">分析仪表板</span>
          </button>
        </nav>

        {/* 通知中心 - 侧边栏底部 */}
        <NotificationCenter
          notifications={notifications}
          unreadCount={unreadCount}
          isConnected={isConnected}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
        />
      </aside>

      {/* 主内容区 */}
      <main className="admin-main">
        {activePage === 'suggestions' && <SuggestionCenterPage />}
        {activePage === 'permissions' && <RbacPermissionManager />}
        {activePage === 'audit-logs' && <AuditLogPage />}
        {activePage === 'dashboard' && <AnalyticsDashboardPage />}
      </main>

      {/* 浮动 Toast 通知 */}
      <NotificationToast toastQueue={toastQueue} onDismiss={dismissToast} />
    </div>
  );
}

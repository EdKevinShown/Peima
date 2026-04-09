import { useState, useEffect } from 'react';
import './audit-log-page.css';

const API_BASE = 'http://localhost:3000';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    entityType: '',
    status: '',
    startDate: '',
    endDate: '',
    page: 1,
    limit: 20,
  });
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDiffViewer, setShowDiffViewer] = useState(false);

  // 获取审计日志列表
  useEffect(() => {
    fetchAuditLogs();
  }, [filters]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.action) params.append('action', filters.action);
      if (filters.entityType) params.append('entityType', filters.entityType);
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('page', filters.page);
      params.append('limit', filters.limit);

      const token = localStorage.getItem('peimaToken');
      const response = await fetch(`${API_BASE}/audit-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setLogs(data.data || []);
      setPagination(data.pagination || {});
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      alert('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      page: 1, // Reset to first page when filter changes
    }));
  };

  const handleExport = async (format) => {
    try {
      const token = localStorage.getItem('peimaToken');

      // 把当前筛选条件带入导出，与列表一致
      const params = new URLSearchParams();
      params.append('format', format);
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.action) params.append('action', filters.action);
      if (filters.entityType) params.append('entityType', filters.entityType);
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`${API_BASE}/audit-logs/export?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Export failed');

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export audit logs');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const getActionBadge = (action) => {
    const colors = {
      ROLE_ASSIGN: '#28a745',
      ROLE_REVOKE: '#dc3545',
      ROLE_UPDATE: '#17a2b8',
      SUGGESTION_EXPORT: '#6f42c1',
      SUGGESTION_UPDATE: '#ffc107',
      SUGGESTION_BULK_OPERATE: '#fd7e14',
      SUGGESTION_HISTORY_READ: '#6c757d',
      DELETE: '#dc3545',
      CREATE: '#28a745',
      UPDATE: '#ffc107',
    };
    return (
      <span
        className="badge"
        style={{
          backgroundColor: colors[action] || '#6c757d',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
        }}
      >
        {action}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const bgColor = status === 'SUCCESS' ? '#d4edda' : '#f8d7da';
    const textColor = status === 'SUCCESS' ? '#155724' : '#721c24';
    return (
      <span
        style={{
          backgroundColor: bgColor,
          color: textColor,
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="audit-log-page">
      <h1>审计日志</h1>

      {/* Filter Panel */}
      <div className="filter-panel">
        <h3>过滤条件</h3>
        <div className="filter-grid">
          <div className="filter-item">
            <label>用户ID</label>
            <input
              type="text"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              placeholder="输入用户ID"
            />
          </div>

          <div className="filter-item">
            <label>操作类型</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="">全部</option>
              <option value="ROLE_ASSIGN">分配角色</option>
              <option value="ROLE_REVOKE">撤销角色</option>
              <option value="ROLE_UPDATE">批量更新角色</option>
              <option value="SUGGESTION_BULK_OPERATE">批量处理建议</option>
              <option value="SUGGESTION_UPDATE">更新建议</option>
              <option value="SUGGESTION_EXPORT">导出建议</option>
              <option value="SUGGESTION_HISTORY_READ">查看历史</option>
              <option value="DELETE">删除</option>
            </select>
          </div>

          <div className="filter-item">
            <label>实体类型</label>
            <select
              value={filters.entityType}
              onChange={(e) => handleFilterChange('entityType', e.target.value)}
            >
              <option value="">全部</option>
              <option value="SUGGESTION">建议</option>
              <option value="USER">用户</option>
              <option value="ROLE">角色</option>
              <option value="PERMISSION">权限</option>
            </select>
          </div>

          <div className="filter-item">
            <label>状态</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">全部</option>
              <option value="SUCCESS">成功</option>
              <option value="FAILED">失败</option>
            </select>
          </div>

          <div className="filter-item">
            <label>开始日期</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>

          <div className="filter-item">
            <label>结束日期</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>
        </div>

        <div className="filter-actions">
          <button onClick={() => fetchAuditLogs()} disabled={loading}>
            {loading ? '加载中...' : '搜索'}
          </button>
          <button onClick={() => handleExport('csv')}>导出 CSV</button>
          <button onClick={() => handleExport('json')}>导出 JSON</button>
        </div>
      </div>

      {/* Results */}
      <div className="results-section">
        <h3>结果 ({pagination.total} 条记录)</h3>

        {loading ? (
          <p className="loading">加载中...</p>
        ) : logs.length === 0 ? (
          <p className="no-results">没有找到匹配的审计日志</p>
        ) : (
          <>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>用户</th>
                  <th>操作</th>
                  <th>实体类型</th>
                  <th>实体ID</th>
                  <th>状态</th>
                  <th>耗时 (ms)</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.createdAt)}</td>
                    <td>{log.user?.nickname || log.userId}</td>
                    <td>{getActionBadge(log.action)}</td>
                    <td>{log.entityType}</td>
                    <td className="entity-id">{log.entityId || '-'}</td>
                    <td>{getStatusBadge(log.status)}</td>
                    <td>{log.duration || '-'}</td>
                    <td>
                      {(log.oldValues || log.newValues) && (
                        <button
                          className="view-btn"
                          onClick={() => {
                            setSelectedLog(log);
                            setShowDiffViewer(true);
                          }}
                        >
                          查看
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="pagination">
              <button
                disabled={filters.page === 1}
                onClick={() =>
                  handleFilterChange('page', Math.max(1, filters.page - 1))
                }
              >
                ← 上一页
              </button>
              <span>
                第 {filters.page} / {pagination.pages} 页
              </span>
              <button
                disabled={filters.page >= pagination.pages}
                onClick={() =>
                  handleFilterChange('page', Math.min(pagination.pages, filters.page + 1))
                }
              >
                下一页 →
              </button>
            </div>
          </>
        )}
      </div>

      {/* Diff Viewer Modal */}
      {showDiffViewer && selectedLog && (
        <div className="modal-overlay" onClick={() => setShowDiffViewer(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>变更详情</h2>
              <button className="close-btn" onClick={() => setShowDiffViewer(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="info-grid">
                <div className="info-item">
                  <label>ID</label>
                  <code>{selectedLog.id}</code>
                </div>
                <div className="info-item">
                  <label>用户</label>
                  <span>{selectedLog.user?.nickname || selectedLog.userId}</span>
                </div>
                <div className="info-item">
                  <label>IP地址</label>
                  <code>{selectedLog.ipAddress || 'N/A'}</code>
                </div>
                <div className="info-item">
                  <label>原因</label>
                  <span>{selectedLog.changeReason || '-'}</span>
                </div>
              </div>

              {/* Old vs New Values */}
              {(selectedLog.oldValues || selectedLog.newValues) && (
                <div className="diff-container">
                  <div className="diff-panel old">
                    <h4>变更前</h4>
                    <pre>
                      {JSON.stringify(selectedLog.oldValues || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="diff-panel new">
                    <h4>变更后</h4>
                    <pre>
                      {JSON.stringify(selectedLog.newValues || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedLog.errorMessage && (
                <div className="error-section">
                  <h4>错误信息</h4>
                  <pre className="error-message">{selectedLog.errorMessage}</pre>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowDiffViewer(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Admin：建议中心表格
 */

import React, { useState } from "react";
import "../styles/suggestion-table.css";

export function SuggestionCenterTable({
  items = [],
  total = 0,
  page = 1,
  pageSize = 20,
  onBulkAction = () => {},
  onPageChange = () => {},
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(items.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkAccept = async () => {
    setActionInProgress(true);
    try {
      await onBulkAction(selectedIds, "accept");
      setSelectedIds([]);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleBulkDismiss = async () => {
    setActionInProgress(true);
    try {
      await onBulkAction(selectedIds, "dismiss");
      setSelectedIds([]);
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="table-container">
      {/* 批量操作栏 */}
      {selectedIds.length > 0 && (
        <div className="bulk-actions">
          <span>已选中 {selectedIds.length} 项</span>
          <button
            onClick={handleBulkAccept}
            disabled={actionInProgress}
            className="action-btn accept"
          >
            {actionInProgress ? "处理中..." : "批量接受"}
          </button>
          <button
            onClick={handleBulkDismiss}
            disabled={actionInProgress}
            className="action-btn dismiss"
          >
            {actionInProgress ? "处理中..." : "批量忽略"}
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="action-btn cancel"
          >
            取消选择
          </button>
        </div>
      )}

      {/* 表格 */}
      <table className="suggestions-table">
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                type="checkbox"
                checked={
                  selectedIds.length > 0 && selectedIds.length === items.length
                }
                onChange={handleSelectAll}
              />
            </th>
            <th>用户</th>
            <th>状态</th>
            <th>优先级</th>
            <th>分类</th>
            <th>建议内容</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr className="empty-row">
              <td colSpan="8">暂无建议</td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className={`suggestion-row ${item.status}`}>
                <td className="checkbox-col">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => handleSelectOne(item.id)}
                  />
                </td>
                <td className="user-cell">
                  {item.userPhone || "未知"}
                  <br />
                  <small>{item.userId.slice(0, 8)}...</small>
                </td>
                <td>
                  <span className={`status-badge ${item.status}`}>
                    {statusLabel(item.status)}
                  </span>
                </td>
                <td>
                  <span className={`priority-badge ${item.priority}`}>
                    {priorityLabel(item.priority)}
                  </span>
                </td>
                <td>
                  <span className="category-badge">
                    {categoryLabel(item.category)}
                  </span>
                </td>
                <td className="content-cell">
                  <div className="content-preview">
                    {formatPatch(item.proposedPatch)}
                  </div>
                  {expandedId === item.id && (
                    <div className="content-full">
                      <pre>{JSON.stringify(item.proposedPatch, null, 2)}</pre>
                    </div>
                  )}
                </td>
                <td className="time-cell">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
                <td className="actions-cell">
                  <button
                    className="btn-small"
                    onClick={() =>
                      setExpandedId(expandedId === item.id ? null : item.id)
                    }
                  >
                    {expandedId === item.id ? "隐藏" : "展开"}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* 分页 */}
      {total > pageSize && (
        <div className="pagination">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="page-btn"
          >
            上一页
          </button>
          <span className="page-info">
            第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= Math.ceil(total / pageSize)}
            className="page-btn"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

function statusLabel(status) {
  const labels = {
    pending: "待处理",
    accepted: "已接受",
    dismissed: "已忽略",
  };
  return labels[status] || status;
}

function priorityLabel(priority) {
  const labels = {
    high: "高",
    medium: "中",
    low: "低",
  };
  return labels[priority] || priority;
}

function categoryLabel(category) {
  const labels = {
    profile_refinement: "画像优化",
    behavioral_insight: "行为洞察",
    communication_style: "沟通风格",
    compatibility_tip: "兼容性提示",
    education: "教育背景",
    preference: "偏好设置",
    bio: "个人简介",
    physique: "体型体貌",
    occupation: "职业信息",
  };
  return labels[category] || category;
}

function formatPatch(patch) {
  if (!patch) return "-";
  const entries = Object.entries(patch);
  return entries.map(([key, value]) => `${key}: ${value}`).join(" | ");
}

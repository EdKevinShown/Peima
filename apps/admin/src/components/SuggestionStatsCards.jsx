/**
 * Admin：建议中心统计卡片
 */

import React from "react";
import "../styles/suggestion-stats.css";

export function SuggestionStatsCards({ stats = {} }) {
  if (!stats || Object.keys(stats).length === 0) {
    return <div className="stats-container">加载中...</div>;
  }

  const {
    totalCount = 0,
    pendingCount = 0,
    acceptedCount = 0,
    dismissedCount = 0,
    byPriority = {},
    byCategory = {},
  } = stats;

  return (
    <div className="stats-container">
      <div className="stats-grid">
        {/* 主统计 */}
        <div className="stat-card total">
          <div className="stat-value">{totalCount}</div>
          <div className="stat-label">总建议数</div>
        </div>

        <div className="stat-card pending">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">待处理</div>
        </div>

        <div className="stat-card accepted">
          <div className="stat-value">{acceptedCount}</div>
          <div className="stat-label">已接受</div>
        </div>

        <div className="stat-card dismissed">
          <div className="stat-value">{dismissedCount}</div>
          <div className="stat-label">已忽略</div>
        </div>
      </div>

      {/* 优先级分布 */}
      {Object.keys(byPriority).length > 0 && (
        <div className="stats-breakdown">
          <h4>优先级分布</h4>
          <div className="breakdown-grid">
            {Object.entries(byPriority).map(([priority, count]) => (
              <div key={priority} className="breakdown-item">
                <span className="priority-badge">{priorityLabel(priority)}</span>
                <span className="count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分类分布 */}
      {Object.keys(byCategory).length > 0 && (
        <div className="stats-breakdown">
          <h4>分类分布</h4>
          <div className="breakdown-grid">
            {Object.entries(byCategory).map(([category, count]) => (
              <div key={category} className="breakdown-item">
                <span className="category-badge">{categoryLabel(category)}</span>
                <span className="count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function priorityLabel(priority) {
  const labels = {
    high: "高优先级",
    medium: "中优先级",
    low: "低优先级",
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

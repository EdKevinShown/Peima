/**
 * Admin：建议中心筛选栏
 */

import React, { useState } from "react";
import "../styles/suggestion-filter.css";

export function SuggestionFilterBar({ onFilterChange = () => {} }) {
  const [filters, setFilters] = useState({
    status: "",
    priority: [],
    category: [],
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const handleStatusChange = (e) => {
    const newFilters = { ...filters, status: e.target.value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handlePriorityChange = (priority) => {
    let newPriorities = filters.priority.includes(priority)
      ? filters.priority.filter((p) => p !== priority)
      : [...filters.priority, priority];
    const newFilters = { ...filters, priority: newPriorities };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleCategoryChange = (category) => {
    let newCategories = filters.category.includes(category)
      ? filters.category.filter((c) => c !== category)
      : [...filters.category, category];
    const newFilters = { ...filters, category: newCategories };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleSortChange = (e) => {
    const [sortBy, sortOrder] = e.target.value.split("-");
    const newFilters = { ...filters, sortBy, sortOrder };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>状态</label>
        <select value={filters.status} onChange={handleStatusChange}>
          <option value="">全部</option>
          <option value="pending">待处理</option>
          <option value="accepted">已接受</option>
          <option value="dismissed">已忽略</option>
        </select>
      </div>

      <div className="filter-group">
        <label>优先级</label>
        <div className="checkbox-group">
          {["high", "medium", "low"].map((priority) => (
            <label key={priority} className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.priority.includes(priority)}
                onChange={() => handlePriorityChange(priority)}
              />
              <span>{priorityLabel(priority)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>分类</label>
        <div className="checkbox-group">
          {[
            "profile_refinement",
            "behavioral_insight",
            "communication_style",
            "compatibility_tip",
          ].map((category) => (
            <label key={category} className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.category.includes(category)}
                onChange={() => handleCategoryChange(category)}
              />
              <span>{categoryLabel(category)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>排序</label>
        <select
          value={`${filters.sortBy}-${filters.sortOrder}`}
          onChange={handleSortChange}
        >
          <option value="createdAt-desc">最新优先</option>
          <option value="createdAt-asc">最旧优先</option>
          <option value="priority-desc">优先级高→低</option>
          <option value="priority-asc">优先级低→高</option>
        </select>
      </div>

      <button
        className="reset-btn"
        onClick={() => {
          const newFilters = {
            status: "",
            priority: [],
            category: [],
            sortBy: "createdAt",
            sortOrder: "desc",
          };
          setFilters(newFilters);
          onFilterChange(newFilters);
        }}
      >
        重置筛选
      </button>
    </div>
  );
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
    profile_refinement: "画像",
    behavioral_insight: "行为",
    communication_style: "沟通",
    compatibility_tip: "兼容",
    education: "教育",
    preference: "偏好",
    bio: "简介",
    physique: "体貌",
    occupation: "职业",
  };
  return labels[category] || category;
}

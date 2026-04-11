/**
 * Admin：建议中心主页面
 */

import React, { useState, useEffect } from "react";
import { SuggestionFilterBar } from "../components/SuggestionFilterBar";
import { SuggestionStatsCards } from "../components/SuggestionStatsCards";
import { SuggestionCenterTable } from "../components/SuggestionCenterTable";
import { SuggestionExportModal } from "../components/SuggestionExportModal";
import { suggestionCenterAPI } from "../api/suggestion-center";
import "../styles/suggestion-center-page.css";

export function SuggestionCenterPage() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [filters, setFilters] = useState({
    status: "",
    priority: [],
    category: [],
    page: 1,
    pageSize: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // 加载数据
  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 并行加载列表和统计
      const [listData, statsData] = await Promise.all([
        suggestionCenterAPI.list(filters),
        suggestionCenterAPI.stats(filters),
      ]);

      setData(listData);
      setStats(statsData);
    } catch (err) {
      setError(err.message || "加载失败");
      console.error("Error loading suggestions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1, // 筛选时重置到第一页
    }));
  };

  const handleBulkAction = async (suggestionIds, action) => {
    try {
      await suggestionCenterAPI.bulkOperate(
        suggestionIds,
        action,
        undefined,
        `批量${action === "accept" ? "接受" : "忽略"}`
      );
      // 重新加载数据
      await loadData();
    } catch (err) {
      alert("操作失败：" + err.message);
    }
  };

  const handleExport = async (exportOptions) => {
    try {
      await suggestionCenterAPI.exportWithOptions({
        ...filters,
        ...exportOptions,
      });
    } catch (err) {
      alert("导出失败：" + err.message);
    }
  };

  const handlePageChange = (newPage) => {
    setFilters((prev) => ({
      ...prev,
      page: newPage,
    }));
  };

  return (
    <div className="suggestion-center-page">
      <header className="page-header">
        <h1>📋 建议中心</h1>
        <p className="subtitle">运营管理用户画像建议的统一入口</p>
      </header>

      {/* 统计卡片 */}
      {stats && <SuggestionStatsCards stats={stats} />}

      {/* 筛选栏 */}
      <SuggestionFilterBar onFilterChange={handleFilterChange} />

      {/* 导出按钮 */}
      <div className="toolbar">
        <button className="export-btn" onClick={() => setShowExportModal(true)}>
          📥 导出 CSV
        </button>
      </div>

      {/* 导出模态窗口 */}
      <SuggestionExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        selectedCount={selectedCount}
        totalCount={data?.total || 0}
      />

      {/* 加载状态 */}
      {loading && <div className="loading-state">加载中...</div>}

      {/* 错误提示 */}
      {error && <div className="error-state">错误：{error}</div>}

      {/* 表格 */}
      {!loading && data && (
        <SuggestionCenterTable
          items={data.items || []}
          total={data.total || 0}
          page={filters.page}
          pageSize={filters.pageSize}
          onBulkAction={handleBulkAction}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

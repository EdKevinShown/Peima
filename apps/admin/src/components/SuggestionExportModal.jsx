/**
 * Admin：建议导出模态窗口
 * 提供多种导出选项：全部、筛选结果、选中项
 */

import React, { useState } from "react";
import "../styles/suggestion-export.css";

export function SuggestionExportModal({
  isOpen = false,
  onClose = () => {},
  onExport = () => {},
  selectedCount = 0,
  totalCount = 0,
}) {
  const [exportType, setExportType] = useState("filtered"); // filtered | selected | all
  const [selectedFields, setSelectedFields] = useState({
    id: true,
    userId: true,
    status: true,
    priority: true,
    category: true,
    proposedPatch: true,
    createdAt: true,
    operatorNotes: false,
    assignedToOperatorId: false,
  });
  const [isExporting, setIsExporting] = useState(false);

  const toggleField = (field) => {
    setSelectedFields((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleSelectAllFields = (e) => {
    const allSelected = e.target.checked;
    Object.keys(selectedFields).forEach((field) => {
      selectedFields[field] = allSelected;
    });
    setSelectedFields({ ...selectedFields });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportOptions = {
        type: exportType,
        fields: Object.keys(selectedFields).filter((f) => selectedFields[f]),
      };
      await onExport(exportOptions);
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <header className="export-modal-header">
          <h2>📥 导出建议数据</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="export-modal-content">
          {/* 导出类型选择 */}
          <section className="export-section">
            <h3>导出范围</h3>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="filtered"
                  checked={exportType === "filtered"}
                  onChange={(e) => setExportType(e.target.value)}
                />
                <span>筛选结果 ({totalCount} 条)</span>
              </label>
              {selectedCount > 0 && (
                <label>
                  <input
                    type="radio"
                    value="selected"
                    checked={exportType === "selected"}
                    onChange={(e) => setExportType(e.target.value)}
                  />
                  <span>选中项 ({selectedCount} 条)</span>
                </label>
              )}
              <label>
                <input
                  type="radio"
                  value="all"
                  checked={exportType === "all"}
                  onChange={(e) => setExportType(e.target.value)}
                />
                <span>全部数据</span>
              </label>
            </div>
          </section>

          {/* 字段选择 */}
          <section className="export-section">
            <div className="field-header">
              <h3>选择导出字段</h3>
              <button
                className="select-all-btn"
                onClick={handleSelectAllFields}
              >
                全选
              </button>
            </div>
            <div className="field-grid">
              {Object.entries(selectedFields).map(([field, selected]) => (
                <label key={field} className="field-checkbox">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleField(field)}
                  />
                  <span>{getFieldLabel(field)}</span>
                </label>
              ))}
            </div>
          </section>

          {/* 导出预览信息 */}
          <section className="export-info">
            <p>
              📊 即将导出 <strong>{getExportCount()}</strong> 条记录，包含
              <strong> {Object.values(selectedFields).filter(Boolean).length}</strong>
              个字段
            </p>
          </section>
        </div>

        <footer className="export-modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-export"
            onClick={handleExport}
            disabled={isExporting || Object.values(selectedFields).every((v) => !v)}
          >
            {isExporting ? "导出中..." : "导出为 CSV"}
          </button>
        </footer>
      </div>
    </div>
  );

  function getExportCount() {
    switch (exportType) {
      case "selected":
        return selectedCount;
      case "all":
        return "全部";
      default:
        return totalCount;
    }
  }

  function getFieldLabel(field) {
    const labels = {
      id: "建议 ID",
      userId: "用户 ID",
      status: "状态",
      priority: "优先级",
      category: "分类",
      proposedPatch: "建议内容",
      createdAt: "创建时间",
      operatorNotes: "运营备注",
      assignedToOperatorId: "分配运营人员",
    };
    return labels[field] || field;
  }
}

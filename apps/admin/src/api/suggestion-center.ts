/**
 * Admin API 客户端：建议中心
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export const suggestionCenterAPI = {
  /**
   * 获取建议列表
   */
  async list(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        filters.priority.forEach((p) => params.append("priority", p));
      } else {
        params.append("priority", filters.priority);
      }
    }
    if (filters.category) {
      if (Array.isArray(filters.category)) {
        filters.category.forEach((c) => params.append("category", c));
      } else {
        params.append("category", filters.category);
      }
    }
    if (filters.userId) params.append("userId", filters.userId);
    if (filters.page) params.append("page", filters.page);
    if (filters.pageSize) params.append("pageSize", filters.pageSize);
    if (filters.sortBy) params.append("sortBy", filters.sortBy);
    if (filters.sortOrder) params.append("sortOrder", filters.sortOrder);

    const response = await fetch(`${API_BASE}/suggestion-center?${params}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
    });

    if (!response.ok) throw new Error("Failed to fetch suggestions");
    return response.json();
  },

  /**
   * 获取统计数据
   */
  async stats(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.userId) params.append("userId", filters.userId);

    const response = await fetch(
      `${API_BASE}/suggestion-center/stats?${params}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
        },
      }
    );

    if (!response.ok) throw new Error("Failed to fetch stats");
    return response.json();
  },

  /**
   * 批量操作建议
   */
  async bulkOperate(suggestionIds, action, assignToOperatorId, operatorNotes) {
    const response = await fetch(
      `${API_BASE}/suggestion-center/bulk-operate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
        },
        body: JSON.stringify({
          suggestionIds,
          action,
          assignToOperatorId,
          operatorNotes,
        }),
      }
    );

    if (!response.ok) throw new Error("Failed to bulk operate");
    return response.json();
  },

  /**
   * 更新单条建议
   */
  async update(suggestionId, updates) {
    const response = await fetch(
      `${API_BASE}/suggestion-center/${suggestionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) throw new Error("Failed to update suggestion");
    return response.json();
  },

  /**
   * 导出建议为 CSV
   */
  async export(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.priority) params.append("priority", filters.priority);
    if (filters.userId) params.append("userId", filters.userId);

    const response = await fetch(
      `${API_BASE}/suggestion-center/export`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
        },
        body: JSON.stringify(filters),
      }
    );

    if (!response.ok) throw new Error("Failed to export");

    // 获取 CSV 文本
    const csv = await response.text();
    // 触发下载
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `suggestions-${Date.now()}.csv`);
    link.click();
  },

  /**
   * 导出建议为 CSV（带选项）
   * @param options {type: 'filtered'|'selected'|'all', fields: string[], ...filters}
   */
  async exportWithOptions(options = {}) {
    const {
      type = "filtered",
      fields = [
        "id",
        "userId",
        "status",
        "priority",
        "category",
        "proposedPatch",
        "createdAt",
      ],
      ...filters
    } = options;

    const requestBody = {
      type,
      fields,
      ...filters,
    };

    const response = await fetch(`${API_BASE}/suggestion-center/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error("Failed to export");

    // 获取 CSV 文本
    const csv = await response.text();
    // 触发下载
    const timestamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute(
      "download",
      `suggestions-export-${timestamp}-${Date.now()}.csv`
    );
    link.click();
  },
};

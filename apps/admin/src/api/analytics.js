/**
 * Admin API 客户端：分析仪表板
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('peimaToken') || '';
}

export const analyticsAPI = {
  /** 获取管理后台仪表板数据 */
  async getAdminDashboard() {
    const res = await fetch(`${API_BASE}/analytics/admin-dashboard`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch dashboard: ${res.status}`);
    return res.json();
  },
};

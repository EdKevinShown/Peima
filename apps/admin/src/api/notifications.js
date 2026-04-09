/**
 * P5 Phase 2.3: 通知 REST API 客户端
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function getHeaders() {
  const token = localStorage.getItem('peimaToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const notificationsAPI = {
  async list({ page = 1, limit = 20, unreadOnly = false } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(unreadOnly ? { unreadOnly: 'true' } : {}),
    });
    const res = await fetch(`${API_BASE}/notifications?${params}`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async getUnreadCount() {
    const res = await fetch(`${API_BASE}/notifications/unread-count`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async markAsRead(id) {
    const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    return res.json();
  },

  async markAllAsRead() {
    const res = await fetch(`${API_BASE}/notifications/read-all`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    return res.json();
  },
};

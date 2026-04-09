/**
 * Admin：权限管理页面
 * 用于管理用户角色和权限分配（Phase 2.2 数据库持久化版本）
 * 支持角色过期时间设置和实时管理
 */

import React, { useState, useEffect } from "react";
import "../styles/rbac-permission-manager.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const rbacAPI = {
  async getUsers() {
    const response = await fetch(`${API_BASE}/rbac/users`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
    });
    if (!response.ok) throw new Error("Failed to fetch users");
    return response.json();
  },

  async getPermissions() {
    const response = await fetch(`${API_BASE}/rbac/permissions`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
    });
    if (!response.ok) throw new Error("Failed to fetch permissions");
    return response.json();
  },

  async updateUserRole(userId, roles) {
    const response = await fetch(`${API_BASE}/rbac/users/${userId}/roles`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
      body: JSON.stringify({ roles }),
    });
    if (!response.ok) throw new Error("Failed to update user role");
    return response.json();
  },

  async assignRole(userId, roleCode, expiresAt = null) {
    const response = await fetch(`${API_BASE}/rbac/users/${userId}/role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
      body: JSON.stringify({ roleCode, expiresAt }),
    });
    if (!response.ok) throw new Error("Failed to assign role");
    return response.json();
  },

  async removeRole(userId, roleCode) {
    const response = await fetch(`${API_BASE}/rbac/users/${userId}/role/${roleCode}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
    });
    if (!response.ok) throw new Error("Failed to remove role");
    return response.json();
  },

  async getUserRoleDetails(userId) {
    const response = await fetch(`${API_BASE}/rbac/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("peimaToken")}`,
      },
    });
    if (!response.ok) throw new Error("Failed to fetch user details");
    return response.json();
  },
};

export function RbacPermissionManager() {
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingRoles, setEditingRoles] = useState({});
  const [selectedExpiryDate, setSelectedExpiryDate] = useState({});
  const [expandedUserDetails, setExpandedUserDetails] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersData, permsData] = await Promise.all([
        rbacAPI.getUsers(),
        rbacAPI.getPermissions(),
      ]);
      setUsers(usersData.items || []);
      setPermissions(permsData);
    } catch (err) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  // 检查角色是否即将过期（7天内）
  const isRoleExpiringSoon = (expiresAt) => {
    if (!expiresAt) return false;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const daysUntilExpiry = (expiry - now) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  };

  // 检查角色是否已过期
  const isRoleExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) <= new Date();
  };

  // 格式化日期显示
  const formatDate = (dateStr) => {
    if (!dateStr) return "无期限";
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleRoleToggle = (userId, role) => {
    const userRoles = editingRoles[userId] || users.find((u) => u.id === userId)?.roles || [];
    const newRoles = userRoles.includes(role)
      ? userRoles.filter((r) => r !== role)
      : [...userRoles, role];
    setEditingRoles((prev) => ({
      ...prev,
      [userId]: newRoles,
    }));
  };

  const handleSaveRoles = async (userId) => {
    const newRoles = editingRoles[userId];
    if (!newRoles || newRoles.length === 0) {
      alert("用户至少需要一个角色");
      return;
    }

    setUpdatingUserId(userId);
    try {
      await rbacAPI.updateUserRole(userId, newRoles);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, roles: newRoles } : u))
      );
      setEditingRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setEditingUserId(null);
      alert("角色更新成功");
    } catch (err) {
      alert("更新失败：" + err.message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleAssignRoleWithExpiry = async (userId, roleCode, expiryDate) => {
    setUpdatingUserId(userId);
    try {
      await rbacAPI.assignRole(
        userId,
        roleCode,
        expiryDate ? new Date(expiryDate).toISOString() : null
      );
      await loadData(); // 刷新用户数据
      setSelectedExpiryDate((prev) => {
        const next = { ...prev };
        delete next[`${userId}-${roleCode}`];
        return next;
      });
      alert("角色分配成功");
    } catch (err) {
      alert("分配失败：" + err.message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRevokeRole = async (userId, roleCode) => {
    if (!window.confirm(`确定要移除用户的${roleCode}角色吗？`)) {
      return;
    }

    setUpdatingUserId(userId);
    try {
      await rbacAPI.removeRole(userId, roleCode);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, roles: u.roles.filter((r) => r !== roleCode) }
            : u
        )
      );
      alert("角色移除成功");
    } catch (err) {
      alert("移除失败：" + err.message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleCancel = (userId) => {
    setEditingRoles((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setEditingUserId(null);
  };

  const isEditing = (userId) => editingUserId === userId;

  if (loading) {
    return <div className="rbac-loading">加载中...</div>;
  }

  if (error) {
    return <div className="rbac-error">错误：{error}</div>;
  }

  return (
    <div className="rbac-permission-manager">
      <header className="rbac-header">
        <h1>🔐 权限管理（Phase 2.2）</h1>
        <p className="subtitle">管理用户角色和权限分配 | 支持角色过期时间设置</p>
      </header>

      {/* 权限说明 */}
      <section className="rbac-info">
        <h2>角色说明</h2>
        <div className="role-descriptions">
          {permissions?.roles && permissions.roles.map((role) => (
            <div key={role} className="role-card">
              <h4>{role}</h4>
              <p>{permissions.roleDescriptions?.[role] || "N/A"}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 用户列表 */}
      <section className="rbac-users">
        <h2>用户列表</h2>
        <div className="rbac-info-box">
          <p>✨ 现在支持为角色设置过期时间。点击"编辑"可以管理用户的角色分配。</p>
        </div>
        {users.length === 0 ? (
          <div className="empty-state">
            <p>暂无用户数据，请先在系统中注册用户</p>
          </div>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>用户信息</th>
                <th>当前角色</th>
                <th>角色过期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const userEditingRoles = isEditing(user.id)
                  ? editingRoles[user.id]
                  : user.roles;
                return (
                  <tr key={user.id} className={isEditing(user.id) ? "editing" : ""}>
                    <td className="user-info">
                      <div className="user-name">{user.nickname || "未命名"}</div>
                      <div className="user-phone">{user.phone}</div>
                      {user.email && (
                        <div className="user-email">{user.email}</div>
                      )}
                    </td>
                    <td className="user-roles">
                      {isEditing(user.id) ? (
                        <div className="role-editor">
                          {permissions?.roles && permissions.roles.map((role) => (
                            <label key={role} className="role-checkbox">
                              <input
                                type="checkbox"
                                checked={userEditingRoles?.includes(role) || false}
                                onChange={() => handleRoleToggle(user.id, role)}
                              />
                              <span>{role}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="role-badges">
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              <span
                                key={role}
                                className={`badge role-${role.toLowerCase()}`}
                              >
                                {role}
                              </span>
                            ))
                          ) : (
                            <span className="badge role-none">无角色</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="role-expiry">
                      {isEditing(user.id) ? (
                        <div className="expiry-editor">
                          <p className="editor-label">为新角色设置过期时间：</p>
                          <div className="expiry-input-group">
                            {permissions?.roles && permissions.roles.map((role) => (
                              <div key={role} className="expiry-row">
                                <label>{role}</label>
                                <input
                                  type="datetime-local"
                                  value={selectedExpiryDate[`${user.id}-${role}`] || ""}
                                  onChange={(e) =>
                                    setSelectedExpiryDate((prev) => ({
                                      ...prev,
                                      [`${user.id}-${role}`]: e.target.value,
                                    }))
                                  }
                                />
                                <button
                                  className="btn-small btn-assign"
                                  onClick={() =>
                                    handleAssignRoleWithExpiry(
                                      user.id,
                                      role,
                                      selectedExpiryDate[`${user.id}-${role}`]
                                    )
                                  }
                                  disabled={updatingUserId === user.id}
                                >
                                  分配
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="expiry-display">
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              <div
                                key={role}
                                className={`expiry-item ${
                                  isRoleExpired(user[`${role}_expiresAt`])
                                    ? "expired"
                                    : isRoleExpiringSoon(user[`${role}_expiresAt`])
                                    ? "expiring-soon"
                                    : "active"
                                }`}
                              >
                                <span className="role-label">{role}</span>
                                <span className="expiry-date">
                                  {formatDate(user[`${role}_expiresAt`])}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="empty-expiry">-</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="user-actions">
                      {isEditing(user.id) ? (
                        <div className="edit-actions">
                          <button
                            className="btn-save"
                            onClick={() => handleSaveRoles(user.id)}
                            disabled={updatingUserId === user.id}
                          >
                            {updatingUserId === user.id ? "保存中..." : "保存"}
                          </button>
                          <button
                            className="btn-cancel"
                            onClick={() => handleCancel(user.id)}
                            disabled={updatingUserId === user.id}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="view-actions">
                          <button
                            className="btn-edit"
                            onClick={() => {
                              setEditingUserId(user.id);
                              setEditingRoles((prev) => ({
                                ...prev,
                                [user.id]: user.roles || [],
                              }));
                            }}
                          >
                            编辑
                          </button>
                          {user.roles && user.roles.length > 0 && (
                            <div className="role-actions">
                              {user.roles.map((role) => (
                                <button
                                  key={role}
                                  className="btn-revoke"
                                  onClick={() => handleRevokeRole(user.id, role)}
                                  disabled={updatingUserId === user.id}
                                  title={`立即撤销${role}角色`}
                                >
                                  撤销{role}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

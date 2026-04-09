import { useState, useEffect } from 'react';
import { analyticsAPI } from '../api/analytics';
import './analytics-dashboard.css';

const CATEGORY_LABELS = {
  profile_refinement: '画像优化',
  behavioral_insight: '行为洞察',
  communication_style: '沟通风格',
  compatibility_tip: '兼容性提示',
  education: '教育背景',
  preference: '偏好设置',
  bio: '个人简介',
  physique: '体型体貌',
  occupation: '职业信息',
};

const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' };
const STATUS_LABELS = { pending: '待处理', approved: '已通过', rejected: '已拒绝', applied: '已应用' };

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    analyticsAPI.getAdminDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="dash-loading">加载中...</div>;
  if (error) return <div className="dash-error">加载失败：{error} <button onClick={load}>重试</button></div>;
  if (!data) return null;

  return (
    <div className="analytics-dashboard">
      <div className="dash-header">
        <h1>分析仪表板</h1>
        <button className="dash-refresh" onClick={load}>刷新</button>
      </div>

      {/* 核心指标卡片 */}
      <section className="dash-cards">
        <StatCard title="用户总数" value={data.users.total}
          sub={`近7天 +${data.users.newLast7Days} / 近30天 +${data.users.newLast30Days}`} color="blue" />
        <StatCard title="匹配批次" value={data.matching.totalBatches}
          sub={`共 ${data.matching.totalResults} 条结果，均 ${data.matching.avgResultsPerBatch} 条/批`} color="purple" />
        <StatCard title="会话 / 消息" value={data.chat.totalConversations}
          sub={`${data.chat.totalMessages} 条消息 · ${data.chat.totalSummaries} 条摘要`} color="green" />
        <StatCard title="建议总数" value={data.suggestions.total}
          sub={prioritySummary(data.suggestions.byPriority)} color="orange" />
        <StatCard title="审计日志" value={data.audit.totalLogs}
          sub={`近24小时 ${data.audit.last24hCount} 条`} color="red" />
        <StatCard title="通知" value={data.notifications.total}
          sub={`未读 ${data.notifications.unread} 条`} color="teal" />
      </section>

      {/* 用户增长趋势 */}
      <section className="dash-section">
        <h2>用户注册趋势（近14天）</h2>
        {data.userGrowthTrend.length > 0
          ? <BarChart data={data.userGrowthTrend} valueKey="count" label="新注册" color="#4a90d9" />
          : <p className="dash-empty">暂无数据</p>}
      </section>

      {/* 建议处理趋势 */}
      <section className="dash-section">
        <h2>建议处理趋势（近14天）</h2>
        {data.suggestionTrend.length > 0
          ? <DualBarChart data={data.suggestionTrend} />
          : <p className="dash-empty">暂无数据</p>}
      </section>

      {/* 分布面板 */}
      <div className="dash-panels">
        {/* 建议状态分布 */}
        <DistPanel title="建议状态分布" data={data.suggestions.byStatus} labelMap={STATUS_LABELS} color="orange" />
        {/* 建议分类分布 */}
        <DistPanel title="建议分类分布" data={data.suggestions.byCategory} labelMap={CATEGORY_LABELS} color="blue" />
        {/* 角色分配 */}
        <DistPanel title="角色分配统计" data={data.rbac.byRole} labelMap={{}} color="purple"
          extra={<span className="dist-total">共 {data.rbac.totalRoleAssignments} 条</span>} />
        {/* 审计热门操作 */}
        <div className="dist-panel">
          <h3>审计热门操作 TOP10</h3>
          <div className="dist-list">
            {data.audit.topActions.map((a) => (
              <div key={a.action} className="dist-row">
                <span className="dist-label">{a.action}</span>
                <span className="dist-value">{a.count}</span>
                <div className="dist-bar-bg">
                  <div className="dist-bar red" style={{ width: `${percent(a.count, data.audit.totalLogs)}%` }} />
                </div>
              </div>
            ))}
            {data.audit.topActions.length === 0 && <p className="dash-empty">暂无数据</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- helper components ---- */

function StatCard({ title, value, sub, color }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-title">{title}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function DistPanel({ title, data, labelMap, color, extra }) {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="dist-panel">
      <h3>{title} {extra}</h3>
      <div className="dist-list">
        {entries.map(([key, count]) => (
          <div key={key} className="dist-row">
            <span className="dist-label">{labelMap[key] || key}</span>
            <span className="dist-value">{count}</span>
            <div className="dist-bar-bg">
              <div className={`dist-bar ${color}`} style={{ width: `${percent(count, total)}%` }} />
            </div>
          </div>
        ))}
        {entries.length === 0 && <p className="dash-empty">暂无数据</p>}
      </div>
    </div>
  );
}

function BarChart({ data, valueKey, label, color }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div className="bar-chart">
      <div className="bar-chart-bars">
        {data.map((d) => (
          <div key={d.date} className="bar-col">
            <div className="bar-value">{d[valueKey]}</div>
            <div className="bar-fill" style={{ height: `${(d[valueKey] / max) * 100}%`, background: color }} />
            <div className="bar-date">{d.date.slice(5)}</div>
          </div>
        ))}
      </div>
      <div className="bar-legend"><span className="legend-dot" style={{ background: color }} />{label}</div>
    </div>
  );
}

function DualBarChart({ data }) {
  const max = Math.max(...data.flatMap((d) => [d.created, d.resolved]), 1);
  return (
    <div className="bar-chart">
      <div className="bar-chart-bars dual">
        {data.map((d) => (
          <div key={d.date} className="bar-col-dual">
            <div className="bar-pair">
              <div className="bar-fill created" style={{ height: `${(d.created / max) * 100}%` }} title={`新建 ${d.created}`} />
              <div className="bar-fill resolved" style={{ height: `${(d.resolved / max) * 100}%` }} title={`处理 ${d.resolved}`} />
            </div>
            <div className="bar-date">{d.date.slice(5)}</div>
          </div>
        ))}
      </div>
      <div className="bar-legend">
        <span className="legend-dot" style={{ background: '#e8913a' }} />新建
        <span className="legend-dot" style={{ background: '#52b788' }} />已处理
      </div>
    </div>
  );
}

function prioritySummary(byPriority) {
  return Object.entries(byPriority)
    .map(([k, v]) => `${PRIORITY_LABELS[k] || k} ${v}`)
    .join(' · ');
}

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

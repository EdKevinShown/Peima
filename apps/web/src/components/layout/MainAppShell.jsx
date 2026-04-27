/**
 * Phase G v0.1 — 已登录用户主路径统一壳（问卷 / 画像 / 等待 / Final Match / Chat / 时间线 / Copilot / 我的活动）。
 * Login、首页、预览池、admin 诊断等不在此壳内。
 */
import { Link, Outlet, useLocation } from "react-router-dom";

const pathTitle = (pathname) => {
  if (pathname.startsWith("/chat/timeline")) return "关系时间线";
  if (pathname.startsWith("/chat")) return "聊天";
  if (pathname.startsWith("/copilot")) return "沟通洞察";
  if (pathname.startsWith("/questionnaire-profile")) return "问卷画像";
  if (pathname.startsWith("/questionnaire")) return "问卷";
  if (pathname.startsWith("/matching-waiting")) return "匹配等待";
  if (pathname.startsWith("/final-match")) return "最终匹配";
  if (pathname.startsWith("/my-activity")) return "我的反馈与动态";
  return "";
};

const shellWrap = {
  minHeight: "100vh",
  background: "#f1f5f9",
  display: "flex",
  flexDirection: "column",
};

const headerBar = {
  flexShrink: 0,
  borderBottom: "1px solid #e2e8f0",
  background: "#fff",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const headerInner = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "0.65rem 1rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
};

const brandStyle = {
  fontWeight: 700,
  fontSize: "1.05rem",
  color: "#0f172a",
  textDecoration: "none",
};

const pageTitleStyle = {
  fontSize: "0.92rem",
  color: "#475569",
  fontWeight: 500,
};

const navMuted = {
  fontSize: "0.82rem",
  color: "#64748b",
};

const outletWrap = {
  flex: 1,
  padding: "0.5rem 0 2rem",
};

export default function MainAppShell() {
  const { pathname } = useLocation();
  const title = pathTitle(pathname);

  return (
    <div style={shellWrap}>
      <header style={headerBar}>
        <div style={headerInner}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link to="/" style={brandStyle}>
              配吗
            </Link>
            {title ? (
              <>
                <span style={{ color: "#cbd5e1" }} aria-hidden>
                  /
                </span>
                <span style={pageTitleStyle}>{title}</span>
              </>
            ) : null}
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: "0.75rem", ...navMuted }}>
            <Link to="/" style={{ color: "#64748b" }}>
              功能索引
            </Link>
            <Link to="/login" style={{ color: "#64748b" }}>
              登录
            </Link>
          </nav>
        </div>
      </header>
      <div style={outletWrap}>
        <Outlet />
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import MainAppShell from "../components/layout/MainAppShell";
import FinalMatchPage from "../pages/FinalMatchPage";
import MatchingWaitingPage from "../pages/MatchingWaitingPage";
import PreviewPoolPage from "../pages/PreviewPoolPage";
import QuestionnairePage from "../pages/QuestionnairePage";
import QuestionnaireProfilePage from "../pages/QuestionnaireProfilePage";
import ChatPage from "../pages/ChatPage";
import CopilotPage from "../pages/CopilotPage";
import RelationshipTimelinePage from "../pages/RelationshipTimelinePage";
import LoginPage from "../pages/LoginPage";
import UserImagesPage from "../pages/UserImagesPage";
import AccountPage from "../pages/AccountPage";
import MyActivityPage from "../pages/MyActivityPage";
import AiSimulationJobDiagnosticPage from "../pages/AiSimulationJobDiagnosticPage";
import AiSimulationJobTriagePage from "../pages/AiSimulationJobTriagePage";

function readPeimaUserId() {
  try {
    return (localStorage.getItem("peimaUserId") || "").trim();
  } catch {
    return "";
  }
}

/** Phase G v0.3：最小产品入口（非路由清单）；主 CTA 仅登录 / 继续等待页。 */
function HomePage() {
  const [userId, setUserId] = useState(readPeimaUserId);
  useEffect(() => {
    setUserId(readPeimaUserId());
    const onStorage = (e) => {
      if (e.key === "peimaUserId" || e.key == null) setUserId(readPeimaUserId());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loggedIn = Boolean(userId);
  const primaryHref = loggedIn
    ? `/matching-waiting?userId=${encodeURIComponent(userId)}`
    : "/login";
  const primaryLabel = loggedIn ? "继续匹配流程" : "登录 / 注册";

  const primaryBtn = {
    display: "inline-block",
    marginTop: "1rem",
    padding: "0.7rem 1.35rem",
    fontSize: "1rem",
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    background: "#1e293b",
    color: "#fff",
    textDecoration: "none",
    cursor: "pointer",
  };

  return (
    <main style={{ maxWidth: 520, margin: "2rem auto", padding: "0 1rem" }}>
      <div
        style={{
          padding: "1.35rem 1.25rem",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <h1 style={{ fontSize: "1.45rem", margin: "0 0 0.4rem", color: "#0f172a", fontWeight: 700 }}>
          配吗
        </h1>
        <p style={{ margin: 0, color: "#475569", fontSize: "0.95rem", lineHeight: 1.55 }}>
          {loggedIn
            ? "欢迎回来。从匹配等待页可查看进度、结果就绪后的说明，并前往最终结果与聊天。"
            : "用手机号登录后，完成问卷与匹配流程，即可查看结果并与匹配对象聊天。"}
        </p>
        <Link to={primaryHref} style={primaryBtn}>
          {primaryLabel}
        </Link>
        {loggedIn ? (
          <p style={{ margin: "0.85rem 0 0", fontSize: "0.82rem", color: "#64748b", lineHeight: 1.45 }}>
            需要改资料或图片？请用{" "}
            <Link to="/account" style={{ color: "#475569" }}>
              账户
            </Link>
            {" · "}
            <Link to="/questionnaire" style={{ color: "#475569" }}>
              问卷
            </Link>
            {" · "}
            <Link to="/my-images" style={{ color: "#475569" }}>
              我的图片
            </Link>
            。
          </p>
        ) : null}
      </div>

      <details style={{ marginTop: "1.75rem", fontSize: "0.82rem", color: "#64748b" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569" }}>
          更多（页面索引与内部入口）
        </summary>
        <p style={{ margin: "0.65rem 0 0.5rem", color: "#94a3b8", fontSize: "0.78rem" }}>
          以下链接供开发与排障使用，不在主流程中。
        </p>
        <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.65 }}>
          <li>
            <Link to="/login">登录</Link>
            {" · "}
            <Link to="/account">账户</Link>
            {" · "}
            <Link to="/my-images">我的图片</Link>
            {" · "}
            <Link to="/my-activity">我的反馈与动态</Link>
          </li>
          <li>
            <Link to="/questionnaire">问卷</Link>
            {" · "}
            <Link to="/questionnaire-profile">问卷画像</Link>
            {" · "}
            <Link to="/preview-pool">预览池</Link>
          </li>
          <li>
            <Link to="/matching-waiting">匹配等待</Link>
            {" · "}
            <Link to="/final-match">最终结果</Link>
          </li>
          <li>
            <Link to="/chat">聊天</Link>
            {" · "}
            <Link to="/copilot">沟通洞察</Link>
            {" · "}
            <Link to="/chat/timeline">关系时间线</Link>
          </li>
          <li style={{ marginTop: "0.35rem" }}>
            <Link to="/admin/ai-sim-job-triage" style={{ color: "#94a3b8" }}>
              内部分诊列表
            </Link>
            {" · "}
            <Link to="/admin/ai-sim-job-diagnostic" style={{ color: "#94a3b8" }}>
              内部诊断详情
            </Link>
          </li>
        </ul>
      </details>

      <footer style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0", fontSize: "0.75rem", color: "#94a3b8" }}>
        <Link to="/" style={{ color: "#94a3b8" }}>
          首页
        </Link>
        {" · "}
        <Link to="/login" style={{ color: "#94a3b8" }}>
          登录
        </Link>
      </footer>
    </main>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/preview-pool" element={<PreviewPoolPage />} />
      <Route path="/my-images" element={<UserImagesPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/admin/ai-sim-job-diagnostic" element={<AiSimulationJobDiagnosticPage />} />
      <Route path="/admin/ai-sim-job-triage" element={<AiSimulationJobTriagePage />} />
      <Route element={<MainAppShell />}>
        <Route path="questionnaire" element={<QuestionnairePage />} />
        <Route path="questionnaire-profile" element={<QuestionnaireProfilePage />} />
        <Route path="matching-waiting" element={<MatchingWaitingPage />} />
        <Route path="final-match" element={<FinalMatchPage />} />
        <Route path="chat/timeline" element={<RelationshipTimelinePage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="copilot" element={<CopilotPage />} />
        <Route path="my-activity" element={<MyActivityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

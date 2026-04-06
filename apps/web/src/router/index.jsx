import { Link, Navigate, Route, Routes } from "react-router-dom";
import FinalMatchPage from "../pages/FinalMatchPage";
import MatchingWaitingPage from "../pages/MatchingWaitingPage";
import PreviewPoolPage from "../pages/PreviewPoolPage";
import QuestionnairePage from "../pages/QuestionnairePage";
import ChatPage from "../pages/ChatPage";
import CopilotPage from "../pages/CopilotPage";
import RelationshipTimelinePage from "../pages/RelationshipTimelinePage";
import LoginPage from "../pages/LoginPage";
import UserImagesPage from "../pages/UserImagesPage";
import AccountPage from "../pages/AccountPage";
import MyActivityPage from "../pages/MyActivityPage";

function HomePage() {
  const hint = "（多数页建议 URL 加 ?userId= 或先登录写入 localStorage）";
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>Peima Web</h1>
      <p style={{ color: "#666", fontSize: "0.88rem" }}>{hint}</p>

      <h2 style={{ fontSize: "1.02rem", marginTop: "1.25rem" }}>账号与资料</h2>
      <ul style={{ marginTop: "0.35rem" }}>
        <li>
          <Link to="/login">/login</Link>
          <span style={{ color: "#666" }}> 手机号登录，JWT</span>
        </li>
        <li>
          <Link to="/account">/account</Link>
          <span style={{ color: "#666" }}> 资料与匹配偏好（需登录，userId 一致）</span>
        </li>
        <li>
          <Link to="/my-images">/my-images</Link>
          <span style={{ color: "#666" }}> 我的图片</span>
        </li>
        <li>
          <Link to="/my-activity">/my-activity</Link>
          <span style={{ color: "#666" }}> P2 反馈、行为信号、我的统计</span>
        </li>
      </ul>

      <h2 style={{ fontSize: "1.02rem", marginTop: "1.1rem" }}>问卷与预览池</h2>
      <ul style={{ marginTop: "0.35rem" }}>
        <li>
          <Link to="/questionnaire">/questionnaire</Link>
          <span style={{ color: "#666" }}> 问卷</span>
        </li>
        <li>
          <Link to="/preview-pool">/preview-pool</Link>
          <span style={{ color: "#666" }}> 预览池生成</span>
        </li>
      </ul>

      <h2 style={{ fontSize: "1.02rem", marginTop: "1.1rem" }}>匹配</h2>
      <ul style={{ marginTop: "0.35rem" }}>
        <li>
          <Link to="/matching-waiting">/matching-waiting</Link>
          <span style={{ color: "#666" }}> 队列状态 / 入队</span>
        </li>
        <li>
          <Link to="/final-match">/final-match</Link>
          <span style={{ color: "#666" }}> 最终结果</span>
        </li>
      </ul>

      <h2 style={{ fontSize: "1.02rem", marginTop: "1.1rem" }}>聊天与 Copilot</h2>
      <ul style={{ marginTop: "0.35rem" }}>
        <li>
          <Link to="/chat">/chat</Link>
          <span style={{ color: "#666" }}> 需 ?conversationId=</span>
        </li>
        <li>
          <Link to="/copilot">/copilot</Link>
          <span style={{ color: "#666" }}> 需 ?conversationId=</span>
        </li>
        <li>
          <Link to="/chat/timeline">/chat/timeline</Link>
          <span style={{ color: "#666" }}> 关系时间线，需 ?conversationId=</span>
        </li>
      </ul>
    </main>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/matching-waiting" element={<MatchingWaitingPage />} />
      <Route path="/final-match" element={<FinalMatchPage />} />
      <Route path="/preview-pool" element={<PreviewPoolPage />} />
      <Route path="/questionnaire" element={<QuestionnairePage />} />
      <Route path="/chat/timeline" element={<RelationshipTimelinePage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/copilot" element={<CopilotPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/my-images" element={<UserImagesPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/my-activity" element={<MyActivityPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

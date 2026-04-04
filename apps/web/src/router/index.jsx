import { Link, Navigate, Route, Routes } from "react-router-dom";
import FinalMatchPage from "../pages/FinalMatchPage";
import MatchingWaitingPage from "../pages/MatchingWaitingPage";
import PreviewPoolPage from "../pages/PreviewPoolPage";
import QuestionnairePage from "../pages/QuestionnairePage";
import ChatPage from "../pages/ChatPage";
import CopilotPage from "../pages/CopilotPage";
import RelationshipTimelinePage from "../pages/RelationshipTimelinePage";
import LoginPage from "../pages/LoginPage";

function HomePage() {
  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>Peima Web</h1>
      <ul>
        <li>
          <Link to="/matching-waiting">/matching-waiting</Link>
          <span style={{ color: "#666" }}>（建议加 ?userId=）</span>
        </li>
        <li>
          <Link to="/final-match">/final-match</Link>
          <span style={{ color: "#666" }}>（建议加 ?userId=）</span>
        </li>
        <li>
          <Link to="/preview-pool">/preview-pool</Link>
          <span style={{ color: "#666" }}>（建议加 ?userId=）</span>
        </li>
        <li>
          <Link to="/questionnaire">/questionnaire</Link>
          <span style={{ color: "#666" }}>（提交需 ?userId=）</span>
        </li>
        <li>
          <Link to="/login">/login</Link>
          <span style={{ color: "#666" }}>（手机号直登，JWT）</span>
        </li>
        <li>
          <Link to="/copilot">/copilot</Link>
          <span style={{ color: "#666" }}>（需 ?conversationId=，只读建议）</span>
        </li>
        <li>
          <Link to="/chat/timeline">/chat/timeline</Link>
          <span style={{ color: "#666" }}>（需 ?conversationId=，只读时间线）</span>
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

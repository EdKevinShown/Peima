import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
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
import AccountPage from "../pages/AccountPage";
import MyActivityPage from "../pages/MyActivityPage";
import AiSimulationJobDiagnosticPage from "../pages/AiSimulationJobDiagnosticPage";
import AiSimulationJobTriagePage from "../pages/AiSimulationJobTriagePage";
import AdminPhotoReviewPage from "../pages/AdminPhotoReviewPage";
import OnboardingPhotoUploadPage from "../pages/OnboardingPhotoUploadPage";
import OnboardingPhotoPreferencePage from "../pages/OnboardingPhotoPreferencePage";
import OnboardingPhotoPreviewPage from "../pages/OnboardingPhotoPreviewPage";
import { resolveUserId } from "../utils/resolveUserId";
import { getOnboardingPhotoStatus } from "../api/onboarding";

/** P7 收口：旧 /my-images 统一进 onboarding 上传页，避免绕过审美与预览门禁。 */
function LegacyMyImagesRedirect() {
  const [searchParams] = useSearchParams();
  const userId = resolveUserId(searchParams);
  const to = userId
    ? `/onboarding/photo-upload?userId=${encodeURIComponent(userId)}`
    : "/onboarding/photo-upload";
  return <Navigate to={to} replace />;
}

function readPeimaUserId() {
  try {
    return (localStorage.getItem("peimaUserId") || "").trim();
  } catch {
    return "";
  }
}

/** Phase G v0.3 + P7：首页主 CTA 按 onboarding 状态分流；主导航为照片 onboarding 流程。 */
function HomePage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(readPeimaUserId);
  const [ctaBusy, setCtaBusy] = useState(false);

  useEffect(() => {
    setUserId(readPeimaUserId());
    const onStorage = (e) => {
      if (e.key === "peimaUserId" || e.key == null) setUserId(readPeimaUserId());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loggedIn = Boolean(userId);
  const uidEnc = userId ? encodeURIComponent(userId) : "";

  const onContinueFlow = useCallback(async () => {
    if (!userId) return;
    setCtaBusy(true);
    try {
      const status = await getOnboardingPhotoStatus();
      const q = `?userId=${encodeURIComponent(userId)}`;
      if (status.nextStep === "photo_upload") {
        navigate(`/onboarding/photo-upload${q}`);
      } else if (status.nextStep === "photo_preference") {
        navigate(`/onboarding/photo-preference${q}`);
      } else if (status.nextStep === "photo_preview") {
        navigate(`/onboarding/photo-preview${q}`);
      } else {
        navigate(`/questionnaire${q}`);
      }
    } catch {
      navigate(`/onboarding/photo-upload?userId=${encodeURIComponent(userId)}`);
    } finally {
      setCtaBusy(false);
    }
  }, [userId, navigate]);

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

  const navLink = { color: "#475569", fontWeight: 500 };
  const q = userId ? `?userId=${uidEnc}` : "";

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
            ? "欢迎回来。建议先完成照片、审美偏好与第一印象预览，再填写关系画像问卷。最终匹配会综合问卷与系统主链，不仅看照片。"
            : "用手机号登录后，先完成照片与审美预览，再填写关系画像问卷。最终匹配会综合问卷与系统主链，不仅看照片。"}
        </p>
        {loggedIn ? (
          <button
            type="button"
            disabled={ctaBusy}
            onClick={() => void onContinueFlow()}
            style={{ ...primaryBtn, opacity: ctaBusy ? 0.75 : 1 }}
          >
            {ctaBusy ? "正在进入…" : "继续匹配流程"}
          </button>
        ) : (
          <Link to="/login" style={primaryBtn}>
            登录 / 注册
          </Link>
        )}
        {loggedIn ? (
          <div style={{ margin: "1rem 0 0", fontSize: "0.86rem", color: "#475569", lineHeight: 1.65 }}>
            <div style={{ fontWeight: 600, color: "#334155", marginBottom: "0.35rem" }}>照片与第一印象</div>
            <p style={{ margin: "0 0 0.5rem" }}>
              <Link to={`/onboarding/photo-upload${q}`} style={navLink}>
                上传 / 更新照片
              </Link>
              {" · "}
              <Link to={`/onboarding/photo-preference${q}`} style={navLink}>
                审美偏好
              </Link>
              {" · "}
              <Link to={`/onboarding/photo-preview${q}`} style={navLink}>
                第一印象预览池
              </Link>
            </p>
            <div style={{ fontWeight: 600, color: "#334155", margin: "0.75rem 0 0.35rem" }}>问卷与匹配</div>
            <p style={{ margin: "0 0 0.5rem" }}>
              <Link to={`/questionnaire${q}`} style={navLink}>
                关系画像问卷
              </Link>
              <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                （须先完成照片与预览等步骤，未满足时打开会跳转到对应环节）
              </span>
            </p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>
              <Link to={`/matching-waiting${q}`} style={{ color: "#64748b" }}>
                匹配等待
              </Link>
              {" · "}
              <Link to="/account" style={{ color: "#64748b" }}>
                账户
              </Link>
            </p>
          </div>
        ) : null}
      </div>

      <details style={{ marginTop: "1.75rem", fontSize: "0.82rem", color: "#64748b" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569" }}>
          更多（页面索引与内部入口）
        </summary>
        <p style={{ margin: "0.65rem 0 0.5rem", color: "#94a3b8", fontSize: "0.78rem" }}>
          以下含正式匹配候选池等，供开发排障；日常请用上方「第一印象预览池」。
        </p>
        <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.65 }}>
          <li>
            <Link to="/login">登录</Link>
            {" · "}
            <Link to="/account">账户</Link>
            {" · "}
            <Link to={`/onboarding/photo-upload${q}`}>上传 / 更新照片</Link>
            {" · "}
            <Link to={`/onboarding/photo-preference${q}`}>审美偏好</Link>
            {" · "}
            <Link to={`/onboarding/photo-preview${q}`}>第一印象预览池</Link>
            {" · "}
            <Link to="/my-activity">我的反馈与动态</Link>
          </li>
          <li>
            <Link to={`/questionnaire${q}`}>关系画像问卷</Link>
            {" · "}
            <Link to="/questionnaire-profile">问卷画像</Link>
            {" · "}
            <Link to="/preview-pool" style={{ color: "#94a3b8" }}>
              正式匹配候选池（旧 /preview-pool）
            </Link>
          </li>
          <li>
            <Link to={`/matching-waiting${q}`}>匹配等待</Link>
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
            {" · "}
            <Link to="/admin/photo-review" style={{ color: "#94a3b8" }}>
              照片审核
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
      <Route path="/onboarding/photo-upload" element={<OnboardingPhotoUploadPage />} />
      <Route path="/onboarding/photo-preference" element={<OnboardingPhotoPreferencePage />} />
      <Route path="/onboarding/photo-preview" element={<OnboardingPhotoPreviewPage />} />
      <Route path="/preview-pool" element={<PreviewPoolPage />} />
      <Route path="/my-images" element={<LegacyMyImagesRedirect />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/admin/ai-sim-job-diagnostic" element={<AiSimulationJobDiagnosticPage />} />
      <Route path="/admin/ai-sim-job-triage" element={<AiSimulationJobTriagePage />} />
      <Route path="/admin/photo-review" element={<AdminPhotoReviewPage />} />
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

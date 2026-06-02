import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import {
  FileText, Sparkles, Heart, MessageCircle,
  User, Image as ImageIcon, BarChart3, Users,
  Bot, Calendar, ShieldCheck, Database, Activity, Palette,
} from "lucide-react";
import LandingPage from "../pages/LandingPage";
import FinalMatchPage from "../pages/FinalMatchPage";
import MatchingWaitingPage from "../pages/MatchingWaitingPage";
import PreviewPoolPage from "../pages/PreviewPoolPage";
import QuestionnairePage from "../pages/QuestionnairePage";
import QuestionnaireIntroPage from "../pages/QuestionnaireIntroPage";
import QuestionnaireProfilePage from "../pages/QuestionnaireProfilePage";
import ChatPage from "../pages/ChatPage";
import ChatFeedbackPage from "../pages/ChatFeedbackPage";
import AdminMatchTools from "../components/matching/AdminMatchTools";
import NavCard from "../components/admin/NavCard";
import CopilotPage from "../pages/CopilotPage";
import RelationshipTimelinePage from "../pages/RelationshipTimelinePage";
import LoginPage from "../pages/LoginPage";
import OnboardingPage, { isProfileIncomplete } from "../pages/OnboardingPage";
import AccountPage from "../pages/AccountPage";
import MyActivityPage from "../pages/MyActivityPage";
import AiSimulationJobDiagnosticPage from "../pages/AiSimulationJobDiagnosticPage";
import AiSimulationJobTriagePage from "../pages/AiSimulationJobTriagePage";
import AdminPhotoReviewPage from "../pages/AdminPhotoReviewPage";
import AdminMyAiRecordsPage from "../pages/AdminMyAiRecordsPage";
import P76AllowlistApplyMetaPage from "../pages/P76AllowlistApplyMetaPage";
import P76CanonicalRehearsalPage from "../pages/P76CanonicalRehearsalPage";
import P76CanonicalSidecarPage from "../pages/P76CanonicalSidecarPage";
import P76CanonicalSidecarApplyReviewPage from "../pages/P76CanonicalSidecarApplyReviewPage";
import OnboardingPhotoUploadPage from "../pages/OnboardingPhotoUploadPage";
import OnboardingPhotoPreferencePage from "../pages/OnboardingPhotoPreferencePage";
import PersonalizedMatchmakerPage from "../pages/PersonalizedMatchmakerPage";
import MainAppShell from "../components/layout/MainAppShell";
import { resolveUserId } from "../utils/resolveUserId";
import { getMe } from "../api/auth";
import { getAdminCapabilities } from "../api/admin";

function RequireAuth({ children }) {
  const token = localStorage.getItem("peimaToken");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function SmartFallback() {
  const token = localStorage.getItem("peimaToken");
  return <Navigate to={token ? "/home" : "/"} replace />;
}

function LegacyMyImagesRedirect() {
  const [searchParams] = useSearchParams();
  const userId = resolveUserId(searchParams);
  const to = userId
    ? `/onboarding/photo-upload?userId=${encodeURIComponent(userId)}`
    : "/onboarding/photo-upload";
  return <Navigate to={to} replace />;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("peimaToken");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    const stored = localStorage.getItem("peimaUserNickname");
    if (stored) setNickname(stored);
    getMe()
      .then((me) => setNeedsOnboarding(isProfileIncomplete(me)))
      .catch(() => {});
    getAdminCapabilities()
      .then((c) => setIsAdmin(Boolean(c?.batchMatchTrigger)))
      .catch(() => {});
  }, [navigate]);

  const userId = localStorage.getItem("peimaUserId") || "";
  const uidQs = userId ? `?userId=${encodeURIComponent(userId)}` : "";

  const handleLogout = () => {
    localStorage.removeItem("peimaToken");
    localStorage.removeItem("peimaUserId");
    localStorage.removeItem("peimaUserNickname");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-dvh relative overflow-hidden">
      <div className="orb orb-pink" />
      <div className="orb orb-purple" />

      <div className="relative z-10 max-w-lg mx-auto px-4 py-10 animate-slide-up">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-glow flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)" }}
            >
              配
            </div>
            <div>
              <h1 className="text-xl font-bold text-gradient leading-tight">配吗</h1>
              <p className="text-xs text-white/40">
                {nickname ? `您好 ${nickname}，您配吗？` : "智能关系匹配"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="btn-ghost text-xs px-3 py-1.5 text-white/50"
          >
            退出
          </button>
        </div>

        {needsOnboarding ? (
          <Link
            to="/onboarding"
            className="glass rounded-2xl p-4 flex items-center gap-3 mb-6 transition-all duration-200 hover:scale-[1.01] animate-fade-in"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,107,157,0.14) 0%, rgba(196,77,255,0.10) 100%)",
              border: "1px solid rgba(255,107,157,0.25)",
              textDecoration: "none",
            }}
          >
            <span
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #ff6b9d, #c44dff)",
                boxShadow: "0 6px 18px rgba(255,107,157,0.35)",
              }}
            >
              <Sparkles size={18} strokeWidth={1.8} className="text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">你的资料还差一点</p>
              <p className="text-xs text-white/55 mt-0.5">
                填完问卷，系统才能为你生成专属候选池
              </p>
            </div>
            <span className="text-white/60 text-sm">继续 →</span>
          </Link>
        ) : null}

        <div className="mb-8">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 ml-1">
            照片与第一印象
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <NavCard
              to={`/onboarding/photo-upload${uidQs}`}
              Icon={ImageIcon}
              title="上传照片"
              desc="注册流程第一步"
            />
            <NavCard
              to={`/onboarding/photo-preference${uidQs}`}
              Icon={Palette}
              title="审美偏好"
              desc="选择吸引你的气质"
            />
            <NavCard
              to={`/onboarding/photo-preview${uidQs}`}
              Icon={Sparkles}
              title="第一印象预览池"
              desc="Onboarding 3+2+1 预览"
            />
          </div>

          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 ml-1">
            开始你的旅程
          </p>
          <div className="space-y-2">
            {[
              {
                to: "/questionnaire-intro",
                Icon: FileText,
                title: "1. 填写问卷",
                desc: "让我们了解你的性格与偏好",
              },
              {
                to: "/matching-waiting",
                Icon: Sparkles,
                title: "2. 开始匹配",
                desc: "进入队列，等待配对结果",
              },
              {
                to: "/final-match",
                Icon: Heart,
                title: "3. 查看结果",
                desc: "与你最匹配的那个人",
              },
              {
                to: "/chat",
                Icon: MessageCircle,
                title: "4. 开始聊天",
                desc: "和 Ta 建立真实连接",
              },
            ].map(({ to, Icon, title, desc }) => (
              <Link
                key={to}
                to={to}
                className="glass rounded-2xl p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.01] group"
                style={{ textDecoration: "none" }}
              >
                <span
                  className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,107,157,0.18) 0%, rgba(196,77,255,0.14) 100%)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <Icon size={18} strokeWidth={1.7} className="text-white/90" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white group-hover:text-gradient">
                    {title}
                  </p>
                  <p className="text-xs text-white/45 mt-0.5 truncate">{desc}</p>
                </div>
                <span className="text-white/25 group-hover:text-white/50 transition-colors">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>

        {isAdmin ? (
          <div className="mb-8 glass rounded-2xl p-4">
            <AdminMatchTools userId={userId} compact />
          </div>
        ) : null}

        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 ml-1">
              我的
            </p>
            <div className="grid grid-cols-2 gap-3">
              <NavCard
                to={`/account?userId=${userId}`}
                Icon={User}
                title="我的资料"
                desc="偏好与设置"
              />
              <NavCard
                to={`/onboarding/photo-upload?userId=${userId}`}
                Icon={ImageIcon}
                title="我的照片"
                desc="上传与管理"
              />
              <NavCard to="/my-activity" Icon={BarChart3} title="我的活动" desc="反馈与统计" />
              <NavCard
                to="/questionnaire-profile"
                Icon={Users}
                title="问卷画像"
                desc="性格与偏好"
              />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 ml-1">
              AI 工具
            </p>
            <div className="grid grid-cols-2 gap-3">
              <NavCard to="/copilot" Icon={Bot} title="AI Copilot" desc="沟通洞察与建议" />
              <NavCard to="/chat/timeline" Icon={Calendar} title="关系时间线" desc="你们的故事" />
            </div>
          </div>
          {isAdmin ? (
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 ml-1">
                管理员
              </p>
              <div className="grid grid-cols-2 gap-3">
                <NavCard
                  to="/admin/photo-review"
                  Icon={ShieldCheck}
                  title="照片审核"
                  desc="审核上传照片"
                />
                <NavCard
                  to="/admin/p76/canonical-sidecar"
                  Icon={Database}
                  title="P76 Sidecar"
                  desc="规范侧车列表"
                />
                <NavCard
                  to="/admin/p76/canonical-rehearsal"
                  Icon={Database}
                  title="P76 演练"
                  desc="规范写入演练"
                />
                <NavCard
                  to="/admin/p76/allowlist-apply-meta"
                  Icon={Database}
                  title="P76 灰度应用"
                  desc="灰度应用记录"
                />
                <NavCard
                  to="/admin/ai-sim-job-triage"
                  Icon={Activity}
                  title="AI Sim 分诊"
                  desc="AI 模拟任务分诊"
                />
                <NavCard
                  to="/admin/ai-sim-job-diagnostic"
                  Icon={Activity}
                  title="AI Sim 诊断"
                  desc="任务诊断详情"
                />
                <NavCard
                  to="/admin/my-ai-records"
                  Icon={Database}
                  title="我的 AI 记录"
                  desc="AI 调用记录"
                />
                <NavCard
                  to={`/preview-pool${uidQs}`}
                  Icon={Activity}
                  title="匹配预览池"
                  desc="Legacy · batch-match 排障"
                />
              </div>
            </div>
          ) : null}
        </div>

        <p className="text-center text-white/20 text-xs mt-10">Peima</p>
      </div>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/matchmaker" element={<PersonalizedMatchmakerPage />} />

      {/* Logged-in dashboard + custom onboarding */}
      <Route path="/home" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />

      {/* Legacy redirects */}
      <Route path="/my-images" element={<LegacyMyImagesRedirect />} />

      {/* All logged-in subpages share the MainAppShell top bar */}
      <Route element={<MainAppShell />}>
        <Route path="/questionnaire-intro" element={<QuestionnaireIntroPage />} />
        <Route path="/questionnaire" element={<QuestionnairePage />} />
        <Route path="/questionnaire-profile" element={<QuestionnaireProfilePage />} />
        <Route path="/matching-waiting" element={<MatchingWaitingPage />} />
        <Route path="/final-match" element={<FinalMatchPage />} />
        <Route path="/chat/feedback" element={<ChatFeedbackPage />} />
        <Route path="/chat/timeline" element={<RelationshipTimelinePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/my-activity" element={<MyActivityPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/onboarding/photo-upload" element={<OnboardingPhotoUploadPage />} />
        <Route path="/onboarding/photo-preference" element={<OnboardingPhotoPreferencePage />} />
        <Route path="/onboarding/photo-preview" element={<PreviewPoolPage />} />
        <Route path="/preview-pool" element={<PreviewPoolPage />} />
        <Route path="/admin/ai-sim-job-diagnostic" element={<AiSimulationJobDiagnosticPage />} />
        <Route path="/admin/ai-sim-job-triage" element={<AiSimulationJobTriagePage />} />
        <Route path="/admin/photo-review" element={<AdminPhotoReviewPage />} />
        <Route path="/admin/my-ai-records" element={<AdminMyAiRecordsPage />} />
        <Route path="/admin/p76/allowlist-apply-meta" element={<P76AllowlistApplyMetaPage />} />
        <Route path="/admin/p76/canonical-rehearsal" element={<P76CanonicalRehearsalPage />} />
        <Route path="/admin/p76/canonical-sidecar" element={<P76CanonicalSidecarPage />} />
        <Route
          path="/admin/p76/canonical-sidecar/:id/apply-review"
          element={<P76CanonicalSidecarApplyReviewPage />}
        />
      </Route>

      <Route path="*" element={<SmartFallback />} />
    </Routes>
  );
}

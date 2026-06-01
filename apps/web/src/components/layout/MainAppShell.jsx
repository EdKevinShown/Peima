/**
 * Logged-in app shell: questionnaire, matching, chat, copilot, activity.
 */
import { Link, Outlet, useLocation } from "react-router-dom";

const pathTitle = (pathname) => {
  if (pathname.startsWith("/chat/feedback")) return "聊后反馈";
  if (pathname.startsWith("/chat/timeline")) return "关系时间线";
  if (pathname.startsWith("/chat")) return "聊天";
  if (pathname.startsWith("/copilot")) return "沟通洞察";
  if (pathname.startsWith("/questionnaire-profile")) return "关系画像";
  if (pathname.startsWith("/questionnaire-intro")) return "填写问卷";
  if (pathname.startsWith("/questionnaire")) return "问卷";
  if (pathname.startsWith("/matching-waiting")) return "匹配等待";
  if (pathname.startsWith("/final-match")) return "最终匹配";
  if (pathname.startsWith("/my-activity")) return "我的反馈与动态";
  if (pathname.startsWith("/account")) return "账户";
  if (pathname.startsWith("/onboarding/photo-upload")) return "照片上传";
  if (pathname.startsWith("/onboarding/photo-preference")) return "审美偏好";
  if (pathname.startsWith("/onboarding/photo-preview")) return "第一印象预览";
  if (pathname.startsWith("/preview-pool")) return "预览池";
  if (pathname.startsWith("/admin/photo-review")) return "照片审核";
  if (pathname.startsWith("/admin/my-ai-records")) return "我的 AI 记录";
  if (pathname.startsWith("/admin/ai-sim-job-diagnostic")) return "AI Sim 诊断";
  if (pathname.startsWith("/admin/ai-sim-job-triage")) return "AI Sim 分诊";
  if (pathname.startsWith("/admin/p76/allowlist-apply-meta")) return "P76 灰度应用";
  if (pathname.startsWith("/admin/p76/canonical-rehearsal")) return "P76 演练";
  if (pathname.startsWith("/admin/p76/canonical-sidecar")) return "P76 Sidecar";
  return "";
};

export default function MainAppShell() {
  const { pathname } = useLocation();
  const title = pathTitle(pathname);

  return (
    <div className="min-h-dvh relative overflow-hidden flex flex-col">
      <div className="orb orb-pink" aria-hidden />
      <div className="orb orb-purple" aria-hidden />

      <header className="relative z-20 flex-shrink-0 border-b border-white/10 glass">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <Link to="/home" className="text-base font-bold text-gradient no-underline">
              配吗
            </Link>
            {title ? (
              <>
                <span className="text-white/25" aria-hidden>
                  /
                </span>
                <span className="text-sm text-white/55 font-medium truncate">{title}</span>
              </>
            ) : null}
          </div>
          <nav className="flex items-center gap-3 text-xs text-white/45">
            <Link to="/home" className="hover:text-white/80 transition-colors no-underline text-inherit">
              首页
            </Link>
            <Link to="/account" className="hover:text-white/80 transition-colors no-underline text-inherit">
              账户
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative z-10 flex-1 pb-8">
        <Outlet />
      </div>
    </div>
  );
}

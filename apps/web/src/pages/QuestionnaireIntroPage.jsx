import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileText, Eye } from "lucide-react";
import AppContent from "../components/layout/AppContent";
import { getQuestionnaireProfile } from "../api/questionnaire";
import { resolveUserId } from "../utils/resolveUserId";

/**
 * Interstitial before the questionnaire form.
 *
 * Warns that the questionnaire is one-time-only. If the user has already
 * submitted, sends them to /questionnaire-profile; otherwise routes them
 * into the actual /questionnaire flow (which still handles photo gating).
 */
export default function QuestionnaireIntroPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const userIdQuery = userId ? `?userId=${encodeURIComponent(userId)}` : "";

  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const profile = await getQuestionnaireProfile(userId);
        if (cancelled) return;
        setHasProfile(profile !== null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <AppContent maxWidth="max-w-xl">
      <div className="glass rounded-3xl p-7 sm:p-8 space-y-6">
        <div className="flex items-start gap-3">
          <span
            className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,200,80,0.18), rgba(255,107,157,0.18))",
              border: "1px solid rgba(255,200,80,0.30)",
            }}
          >
            <AlertTriangle size={20} strokeWidth={1.8} className="text-yellow-200" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">关系画像问卷</h1>
            <p className="text-xs uppercase tracking-widest text-yellow-200/70 mt-1">每个账号仅可填写一次</p>
          </div>
        </div>

        <div className="text-sm text-white/70 leading-relaxed space-y-3">
          <p>
            这份问卷是系统为你生成 <span className="text-white font-semibold">关系画像</span> 的核心依据，会长期影响你的匹配结果。
          </p>
          <p>
            为了保证画像的稳定性，<span className="text-white font-semibold">问卷在每个账号上只能完整填写一次</span>，提交后不可重做。
            请在安静的环境中认真作答，约需 8–12 分钟。
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-white/50">正在检查你的问卷状态…</div>
        ) : error ? (
          <div className="text-sm text-red-300 px-4 py-3 rounded-2xl border border-red-400/25"
               style={{ background: "rgba(255,80,80,0.10)" }}>
            无法读取问卷状态：{error}
          </div>
        ) : hasProfile ? (
          <div className="space-y-4">
            <div
              className="px-4 py-3 rounded-2xl text-sm text-emerald-100"
              style={{
                background: "rgba(72,187,120,0.10)",
                border: "1px solid rgba(72,187,120,0.30)",
              }}
            >
              你已经完成过问卷。你可以随时查看你的关系画像，但 <span className="font-semibold">无法重新填写</span>。
            </div>
            <Link
              to={`/questionnaire-profile${userIdQuery}`}
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <Eye size={18} strokeWidth={1.9} />
              查看我的关系画像
            </Link>
            <Link
              to="/home"
              className="btn-ghost w-full inline-flex items-center justify-center text-sm"
            >
              返回首页
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="px-4 py-3 rounded-2xl text-sm text-white/75"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              你还没有填写过问卷。准备好之后点击下方按钮开始；如果尚未完成照片设置，系统会先引导你完成那一步。
            </div>
            <button
              type="button"
              onClick={() => navigate(`/questionnaire${userIdQuery}`)}
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <FileText size={18} strokeWidth={1.9} />
              开始填写问卷
            </button>
            <Link
              to="/home"
              className="btn-ghost w-full inline-flex items-center justify-center text-sm"
            >
              稍后再来
            </Link>
          </div>
        )}
      </div>
    </AppContent>
  );
}

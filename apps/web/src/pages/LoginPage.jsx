import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getMe, login, register } from "../api/auth";
import { getOnboardingPhotoStatus } from "../api/onboarding";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "register" || requestedMode === "login") {
      setMode(requestedMode);
      setError(null);
    }
  }, [searchParams]);

  if (localStorage.getItem("peimaToken")) {
    return <Navigate to="/home" replace />;
  }

  const onSubmit = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === "register"
          ? await register({ phone: phone.trim(), nickname: nickname.trim() })
          : await login({ phone: phone.trim() });
      localStorage.setItem("peimaToken", res.token);
      localStorage.setItem("peimaUserId", res.user.id);
      localStorage.setItem("peimaUserNickname", res.user.nickname || "");
      await getMe();

      const uid = encodeURIComponent(res.user.id);
      const status = await getOnboardingPhotoStatus();
      if (status.nextStep === "photo_upload") {
        navigate(`/onboarding/photo-upload?userId=${uid}`, { replace: true });
      } else if (status.nextStep === "photo_preference") {
        navigate(`/onboarding/photo-preference?userId=${uid}`, { replace: true });
      } else if (status.nextStep === "photo_preview") {
        navigate(`/questionnaire?userId=${uid}`, { replace: true });
      } else {
        navigate(`/questionnaire?userId=${uid}`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [mode, phone, nickname, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 relative overflow-hidden">
      <div className="orb orb-pink" />
      <div className="orb orb-purple" />

      <Link
        to="/"
        className="absolute top-5 left-5 z-20 btn-ghost text-sm px-4 py-2"
      >
        ← 返回
      </Link>

      <div className="relative z-10 w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-4 shadow-glow"
               style={{ background: 'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)' }}>
            <span className="text-3xl">配</span>
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-1">配吗</h1>
          <p className="text-white/50 text-sm">找到真正合适的那个人</p>
        </div>

        <div className="glass rounded-3xl p-8 shadow-glass">
          <div className="flex rounded-2xl p-1 mb-7" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {["login", "register"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                disabled={loading}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  mode === m
                    ? "text-white shadow-glass-sm"
                    : "text-white/45 hover:text-white/70"
                }`}
                style={mode === m ? { background: 'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)' } : {}}
              >
                {m === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-2xl text-sm text-red-300 border border-red-400/25 animate-fade-in"
                 style={{ background: 'rgba(255,80,80,0.10)' }}>
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">手机号</label>
              <input
                className="input-glass"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="13900139000"
                required
                disabled={loading}
              />
            </div>

            {mode === "register" && (
              <div className="animate-fade-in">
                <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">昵称</label>
                <input
                  className="input-glass"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="你想被叫什么"
                  required
                  disabled={loading}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !phone.trim() || (mode === "register" && !nickname.trim())}
              className="btn-primary w-full mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  处理中…
                </span>
              ) : (
                mode === "register" ? "注册并开始" : "登录"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-white/25 text-xs mt-6">
          手机号直登，无需验证码
        </p>
      </div>
    </div>
  );
}

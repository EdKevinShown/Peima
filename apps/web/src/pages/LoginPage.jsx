import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import { getMe, login, register } from "../api/auth";

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={{ display: "block", marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.9rem", color: "#333", marginBottom: "0.35rem" }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        style={{
          width: "100%",
          padding: "0.65rem 0.75rem",
          border: "1px solid #ddd",
          borderRadius: 8,
        }}
      />
    </label>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login"); // login | register
  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === "register"
          ? await register({ phone: phone.trim(), nickname: nickname.trim() })
          : await login({ phone: phone.trim() });

      localStorage.setItem("peimaToken", res.token);
      localStorage.setItem("peimaUserId", res.user.id);

      // P0：最小验证，确保 /auth/me 在当前 token 下可用
      await getMe();

      navigate(`/matching-waiting?userId=${encodeURIComponent(res.user.id)}`, {
        replace: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [mode, phone, nickname, navigate]);

  return (
    <main style={{ maxWidth: 520, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem" }}>
        登录 / 注册
      </h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginTop: 0 }}>
        P0 占位版手机号直登（不做短信验证码）。
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <button
          type="button"
          onClick={() => setMode("login")}
          disabled={loading || mode === "login"}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          disabled={loading || mode === "register"}
        >
          注册
        </button>
      </div>

      {loading && <LoadingState label="正在请求登录…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Field label="手机号" value={phone} onChange={setPhone} placeholder="13900139000" />

        {mode === "register" && (
          <Field
            label="昵称"
            value={nickname}
            onChange={setNickname}
            placeholder="请输入昵称"
          />
        )}

        <button type="submit" disabled={loading}>
          {mode === "register" ? "注册并登录" : "登录"}
        </button>
      </form>

      <div style={{ marginTop: "1rem", color: "#666", fontSize: "0.9rem" }}>
        <Link to="/">返回首页</Link>
      </div>
    </main>
  );
}


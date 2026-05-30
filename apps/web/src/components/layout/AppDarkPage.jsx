import { Link } from "react-router-dom";

/**
 * Full-viewport dark gradient page (landing / login / onboarding / admin).
 */
export default function AppDarkPage({
  children,
  maxWidth = "max-w-3xl",
  showHomeLink = true,
  className = "",
}) {
  return (
    <div className={`min-h-dvh relative overflow-hidden ${className}`}>
      <div className="orb orb-pink" aria-hidden />
      <div className="orb orb-purple" aria-hidden />
      <div className={`relative z-10 mx-auto px-4 py-8 animate-slide-up w-full ${maxWidth}`}>
        {showHomeLink ? (
          <div className="mb-6">
            <Link to="/home" className="btn-ghost text-xs px-3 py-1.5">
              ← 返回首页
            </Link>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

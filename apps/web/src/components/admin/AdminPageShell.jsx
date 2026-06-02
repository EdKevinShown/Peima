import { Link } from "react-router-dom";

/**
 * Unified admin page layout inside MainAppShell (dark Peima background).
 */
export default function AdminPageShell({
  title,
  subtitle,
  backTo = "/home",
  backLabel = "← 返回首页",
  actions,
  children,
  maxWidth = "max-w-6xl",
}) {
  return (
    <div className={`mx-auto w-full px-4 py-6 ${maxWidth}`}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to={backTo}
            className="text-xs text-white/45 hover:text-white/75 mb-2 inline-block no-underline"
          >
            {backLabel}
          </Link>
          {title ? (
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">{title}</h1>
          ) : null}
          {subtitle ? (
            <p className="text-sm text-white/50 mt-1.5 leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

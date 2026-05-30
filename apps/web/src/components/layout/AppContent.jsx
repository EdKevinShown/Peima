/**
 * Content block inside MainAppShell or AppDarkPage.
 */
export default function AppContent({
  title,
  subtitle,
  actions,
  children,
  maxWidth = "max-w-5xl",
}) {
  return (
    <div className={`app-themed-content mx-auto px-4 py-6 w-full ${maxWidth}`}>
      {title || subtitle || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            {title ? (
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">{title}</h1>
            ) : null}
            {subtitle ? (
              <p className="text-sm text-white/50 mt-1.5 leading-relaxed">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

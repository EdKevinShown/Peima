/**
 * Content block inside MainAppShell or AppDarkPage.
 */
export default function AppContent({
  title,
  subtitle,
  actions,
  children,
  maxWidth = "max-w-5xl",
  dense = false,
}) {
  return (
    <div
      className={`app-themed-content mx-auto w-full ${maxWidth} ${
        dense ? "px-0 py-0" : "px-4 py-6"
      }`}
    >
      {title || subtitle || actions ? (
        <div
          className={`flex flex-wrap items-start justify-between gap-2 ${
            dense ? "mb-2" : "mb-6 gap-4"
          }`}
        >
          <div className="min-w-0">
            {title ? (
              <h1
                className={`font-bold text-white leading-tight ${
                  dense ? "text-lg" : "text-xl sm:text-2xl"
                }`}
              >
                {title}
              </h1>
            ) : null}
            {subtitle ? (
              <p
                className={`text-white/50 leading-snug ${
                  dense ? "text-xs mt-0.5 line-clamp-2" : "text-sm mt-1.5 leading-relaxed"
                }`}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

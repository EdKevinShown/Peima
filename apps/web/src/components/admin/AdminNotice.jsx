const VARIANT_CLASS = {
  internal:
    "bg-amber-500/10 border-amber-400/25 text-amber-100",
  warning:
    "bg-amber-500/10 border-amber-400/25 text-amber-100",
  danger:
    "bg-red-500/10 border-red-400/30 text-red-100",
  p0:
    "bg-red-500/15 border-red-400/35 text-red-100",
  info:
    "bg-sky-500/10 border-sky-400/25 text-sky-100",
  success:
    "bg-emerald-500/10 border-emerald-400/25 text-emerald-100",
  disabled:
    "bg-white/5 border-white/15 text-white/55",
};

/**
 * Unified safety / admin / API-disabled notices.
 */
export default function AdminNotice({
  variant = "internal",
  title,
  children,
  sticky = false,
  className = "",
}) {
  const tone = VARIANT_CLASS[variant] ?? VARIANT_CLASS.internal;
  return (
    <div
      role={variant === "danger" || variant === "p0" ? "alert" : undefined}
      className={`rounded-xl border px-3 py-2.5 text-sm leading-relaxed mb-4 ${tone} ${
        sticky ? "sticky top-0 z-20 backdrop-blur-md" : ""
      } ${className}`}
    >
      {title ? <strong className="block mb-1">{title}</strong> : null}
      {children}
    </div>
  );
}
